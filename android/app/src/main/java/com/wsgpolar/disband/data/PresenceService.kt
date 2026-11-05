package com.wsgpolar.disband.data

import com.wsgpolar.disband.core.leave
import com.wsgpolar.disband.core.DisbandSupabase
import io.github.jan.supabase.realtime.RealtimeChannel
import io.github.jan.supabase.realtime.channel
import io.github.jan.supabase.realtime.realtime
import io.github.jan.supabase.realtime.track
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable

/**
 * Payload tracked on the shared `presence:global` channel. Field names must
 * match the web app's `PresencePayload` (`src/lib/presence.ts`).
 */
@Serializable
data class PresencePayload(
    val userId: String,
    val status: UserStatus,
    /** No default, so a cleared track is sent as null rather than left out. */
    val listening: Listening?,
)

/** Where to build the current user's live presence entry. */
data class UserPresenceMap(
    val statuses: MutableStateFlow<Map<String, UserStatus>> = MutableStateFlow(emptyMap()),
)

/**
 * Live presence for the signed-in user, mirroring the web app and iOS. Every
 * online client joins the shared Realtime presence channel and tracks its own
 * `{ userId, status }`; server drops the entry on disconnect.
 */
class PresenceService(private val scope: CoroutineScope) {
    private val client get() = DisbandSupabase.client

    private val _statuses = MutableStateFlow<Map<String, UserStatus>>(emptyMap())
    val statuses: StateFlow<Map<String, UserStatus>> get() = _statuses

    private var channel: RealtimeChannel? = null
    private var ownUserId: String? = null
    private var trackJob: kotlinx.coroutines.Job? = null

    /** Live clients by presence ref. One person can have several (web + phone). */
    private val sessions = mutableMapOf<String, Pair<String, UserStatus>>()
    private var ownStatus: UserStatus? = null
    private var ownListening: Listening? = null

    /** Same leniency as the web's flattenPresenceState: a missing status means online. */
    private fun entryOf(state: kotlinx.serialization.json.JsonObject): Pair<String, UserStatus>? {
        val userId = (state["userId"] as? kotlinx.serialization.json.JsonPrimitive)?.content ?: return null
        val raw = (state["status"] as? kotlinx.serialization.json.JsonPrimitive)?.content
        val status = UserStatus.entries.firstOrNull { it.raw == raw } ?: UserStatus.Online
        return userId to status
    }

    /** Several live sessions: the most present one wins (DND, Online, Idle, Offline), as on web and iOS. */
    private fun rank(status: UserStatus): Int = when (status) {
        UserStatus.Dnd -> 4
        UserStatus.Online -> 3
        UserStatus.Idle -> 2
        UserStatus.Offline -> 0
    }

    private fun publish() {
        val map = mutableMapOf<String, UserStatus>()
        for ((userId, status) in sessions.values) {
            val current = map[userId]
            if (current == null || rank(status) > rank(current)) map[userId] = status
        }
        val own = ownUserId
        val mine = ownStatus
        if (own != null && mine != null) map[own] = mine
        _statuses.value = map
    }

    fun start(userId: String?, status: UserStatus) {
        stop()
        if (userId == null) return
        ownUserId = userId
        ownStatus = status
        val channel = client.channel("presence:global") { presence { } }
        this.channel = channel

        trackJob = scope.launch {
            channel.presenceChangeFlow().collect { action ->
                // One bad entry used to throw out of collect and freeze the
                // roster, so every friend read as offline from then on.
                for (presence in action.leaves.values) sessions.remove(presence.presenceRef)
                for (presence in action.joins.values) {
                    entryOf(presence.state)?.let { sessions[presence.presenceRef] = it }
                }
                publish()
            }
        }

        scope.launch {
            try {
                channel.subscribe()
                try {
                    channel.track(PresencePayload(userId = userId, status = status, listening = ownListening))
                } catch (_: Exception) {
                }
            } catch (_: Exception) {
            }
        }
    }

    fun update(status: UserStatus) {
        val uid = ownUserId ?: return
        ownStatus = status
        publish()
        scope.launch {
            try {
                channel?.track(PresencePayload(userId = uid, status = status, listening = ownListening))
            } catch (_: Exception) {
            }
        }
    }

    /** Share (or clear) what this phone is playing, keeping the current status. */
    fun updateListening(listening: Listening?) {
        ownListening = listening
        val uid = ownUserId ?: return
        val status = ownStatus ?: return
        scope.launch {
            try {
                channel?.track(PresencePayload(userId = uid, status = status, listening = listening))
            } catch (_: Exception) {
            }
        }
    }

    fun status(forUserId: String, fallback: UserStatus = UserStatus.Offline): UserStatus =
        _statuses.value[forUserId] ?: fallback

    fun stop() {
        trackJob?.cancel()
        trackJob = null
        val ch = channel
        channel = null
        scope.launch {
            try {
                ch?.untrack()
                ch?.leave()
            } catch (_: Exception) {
            }
        }
        sessions.clear()
        ownStatus = null
        ownListening = null
        _statuses.value = emptyMap()
    }
}

@Suppress("unused")
fun presenceScope() = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)