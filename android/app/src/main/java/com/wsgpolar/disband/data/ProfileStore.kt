package com.wsgpolar.disband.data

import com.wsgpolar.disband.core.DisbandSupabase
import com.wsgpolar.disband.core.leave
import io.github.jan.supabase.realtime.PostgresAction
import io.github.jan.supabase.realtime.RealtimeChannel
import io.github.jan.supabase.realtime.channel
import io.github.jan.supabase.realtime.postgresChangeFlow
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.merge
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.UUID

/**
 * The newest copy of every profile the app has seen, kept live.
 *
 * Lists (members, friends, DMs, message authors) each carried the profile
 * they were loaded with, so a changed custom status, name or avatar stayed
 * stale everywhere until that list reloaded. Rows now read through this store
 * ([resolve]), which is patched at once by your own edits and by Realtime
 * `profiles` UPDATEs for everyone on screen, as the web does
 * (`AppContext.tsx` "watched-profiles").
 */
object ProfileStore {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    private val _profiles = MutableStateFlow<Map<String, Profile>>(emptyMap())
    val profiles: StateFlow<Map<String, Profile>> = _profiles.asStateFlow()

    /** The freshest copy of [profile], or [profile] itself if none is newer. */
    fun resolve(profile: Profile?): Profile? = profile?.let { _profiles.value[it.id] ?: it }
    fun get(id: String?): Profile? = id?.let { _profiles.value[it] }

    fun put(profile: Profile?) {
        if (profile == null) return
        _profiles.update { it + (profile.id to profile) }
    }

    fun putAll(list: Collection<Profile>) {
        if (list.isEmpty()) return
        _profiles.update { current -> current + list.associateBy { it.id } }
    }

    /** Patch one profile in place (your own optimistic edit). */
    fun patch(id: String, change: (Profile) -> Profile) {
        _profiles.update { current -> current[id]?.let { current + (id to change(it)) } ?: current }
    }

    // MARK: - Live updates

    /** Ids each screen wants watched, by owner key. */
    private val watchers = mutableMapOf<String, Set<String>>()
    private var watchedKey = ""
    private var liveJob: Job? = null
    private var rebuildJob: Job? = null
    private var me: String? = null

    /** Start watching your own row (other devices' edits land here too). */
    fun start(userId: String?) {
        if (me == userId) return
        me = userId
        scheduleRebuild()
    }

    fun reset() {
        me = null
        watchers.clear()
        watchedKey = ""
        liveJob?.cancel()
        liveJob = null
        _profiles.value = emptyMap()
    }

    /** [owner] (a screen) shows these people; their edits should arrive live. */
    fun watch(owner: String, ids: Collection<String>) {
        val next = ids.toSet()
        if (watchers[owner] == next) return
        watchers[owner] = next
        scheduleRebuild()
    }

    fun unwatch(owner: String) {
        if (watchers.remove(owner) != null) scheduleRebuild()
    }

    /** Debounced: lists fill in a few steps; don't churn the channel each time. */
    private fun scheduleRebuild() {
        rebuildJob?.cancel()
        rebuildJob = scope.launch {
            delay(500)
            val uid = me ?: return@launch
            // Realtime rejects an `in` filter over 100 values, and each filter
            // is an index row capped at ~2.7 KB, so 50 ids a binding (web).
            val ids = (watchers.values.flatten() + uid).toSortedSet().take(MAX_WATCHED)
            val key = ids.joinToString(",")
            if (key == watchedKey && liveJob?.isActive == true) return@launch
            watchedKey = key
            liveJob?.cancel()
            liveJob = scope.launch { listen(ids) }
        }
    }

    private suspend fun listen(ids: List<String>) {
        while (true) {
            var channel: RealtimeChannel? = null
            try {
                val ch = DisbandSupabase.client.channel("watched-profiles:${UUID.randomUUID().toString().take(8)}") { }
                channel = ch
                val flows = ids.chunked(50).map { chunk ->
                    ch.postgresChangeFlow<PostgresAction.Update>("public") {
                        table = "profiles"
                        filter = "id=in.(${chunk.joinToString(",")})"
                    }
                }
                ch.subscribe()
                merge(*flows.toTypedArray()).collect { action ->
                    val row = runCatching {
                        DisbandSupabase.sessionJson.decodeFromJsonElement(Profile.serializer(), action.record)
                    }.getOrNull() ?: return@collect
                    // A realtime row has no listening/activity joins; keep ours.
                    val old = _profiles.value[row.id]
                    put(row.copy(listening = row.listening ?: old?.listening, activity = row.activity ?: old?.activity))
                    onChange(row)
                }
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (_: Exception) {
            } finally {
                withContext(NonCancellable) { runCatching { channel?.leave() } }
            }
            delay(3_000)
        }
    }

    /** Set by the app to hear about the signed-in user's own row. */
    var onChange: (Profile) -> Unit = {}

    private const val MAX_WATCHED = 500
}
