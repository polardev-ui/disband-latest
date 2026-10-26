package com.wsgpolar.disband.data

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Cached guild tags for names on screen — Android twin of the iOS
 * `GuildTagStore`. A badge can appear next to every message author, member
 * and friend, so a request per row would be the same mistake as one profile
 * query per row. Views ask for an id; missing ids are batched for a moment
 * and fetched in one `profile_guild_tags` query, then the empty results are
 * cached too.
 */
object GuildTagStore {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val _tags = MutableStateFlow<Map<String, GuildTag?>>(emptyMap())
    val tags: StateFlow<Map<String, GuildTag?>> = _tags.asStateFlow()

    private val pending = mutableSetOf<String>()
    private var flushJob: Job? = null

    fun tagFor(userId: String?): GuildTag? = userId?.let { _tags.value[it] }

    fun ensureLoaded(userId: String?) {
        if (userId.isNullOrBlank()) return
        ensureLoaded(listOf(userId))
    }

    fun ensureLoaded(userIds: List<String>) {
        val missing = userIds.filter { it.isNotBlank() && !_tags.value.containsKey(it) && !pending.contains(it) }
        if (missing.isEmpty()) return
        pending.addAll(missing)
        scheduleFlush()
    }

    fun set(tag: GuildTag, userId: String) {
        val m = _tags.value.toMutableMap()
        m[userId] = tag
        _tags.value = m
        pending.remove(userId)
    }

    fun clear(userId: String) {
        val m = _tags.value.toMutableMap()
        m[userId] = null
        _tags.value = m
        pending.remove(userId)
    }

    fun invalidateAll() {
        _tags.value = emptyMap()
        pending.clear()
        flushJob?.cancel()
        flushJob = null
    }

    fun reset() = invalidateAll()

    private fun scheduleFlush() {
        if (flushJob?.isActive == true) return
        flushJob = scope.launch {
            delay(40)
            flush()
        }
    }

    private suspend fun flush() {
        flushJob = null
        val ids = pending.toList()
        pending.clear()
        if (ids.isEmpty()) return
        val fetched = mutableMapOf<String, GuildTag?>()
        try {
            val rows = Database.guildTags(ids)
            val map = rows.associate { it.userId to it.guildTag() }
            ids.forEach { fetched[it] = map[it] }
        } catch (_: Exception) {
            // Leave these ids unloaded so a later appearance can retry.
            return
        }
        val newMap = _tags.value.toMutableMap()
        ids.forEach { newMap[it] = fetched[it] }
        _tags.value = newMap
        if (pending.isNotEmpty()) scheduleFlush()
    }
}
