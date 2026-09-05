package com.wsgpolar.disband.data

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

    fun start(userId: String?, status: UserStatus) {
        stop()
        if (userId == null) return
        ownUserId = userId
        val channel = client.channel("presence:global") { presence { } }
        this.channel = channel

        trackJob = scope.launch {
            val actionFlow = channel.presenceChangeFlow()
            actionFlow.collect { action ->
                for (presence in action.joins.values) {
                    val payload = DisbandSupabase.sessionJson
                        .decodeFromJsonElement(PresencePayload.serializer(), presence.state)
                    val current = _statuses.value.toMutableMap()
                    current[payload.userId] = payload.status
                    _statuses.value = current
                }
                for (presence in action.leaves.values) {
                    val payload = DisbandSupabase.sessionJson
                        .decodeFromJsonElement(PresencePayload.serializer(), presence.state)
                    if (payload.userId != ownUserId) {
                        val current = _statuses.value.toMutableMap()
                        current.remove(payload.userId)
                        _statuses.value = current
                    }
                }
            }
        }

        scope.launch {
            try {
                channel.subscribe()
                try {
                    channel.track(PresencePayload(userId = userId, status = status))
                } catch (_: Exception) {
                }
            } catch (_: Exception) {
            }
        }
    }

    fun update(status: UserStatus) {
        val uid = ownUserId ?: return
        val current = _statuses.value.toMutableMap()
        current[uid] = status
        _statuses.value = current
        scope.launch {
            try {
                channel?.track(PresencePayload(userId = uid, status = status))
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
                ch?.unsubscribe()
            } catch (_: Exception) {
            }
        }
        _statuses.value = emptyMap()
    }
}

@Suppress("unused")
fun presenceScope() = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)