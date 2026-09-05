package com.wsgpolar.disband.data

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json

/**
 * Per-conversation unread counts for the Messages tab (DMs and group chats),
 * mirroring the iOS `DmUnreadStore`. Persisted across relaunches; opening a
 * chat zeroes its count and the server cursor is synced separately.
 */
class DmUnreadStore(context: Context) {
    private val prefs = context.getSharedPreferences("disband_unread", Context.MODE_PRIVATE)
    private val json = Json

    private val _unread = MutableStateFlow(load("dmUnreadCounts"))
    val unread: StateFlow<Map<String, Int>> = _unread.asStateFlow()

    private val _groupUnread = MutableStateFlow(load("groupUnreadCounts"))
    val groupUnread: StateFlow<Map<String, Int>> = _groupUnread.asStateFlow()

    @Volatile
    var activeThreadId: String? = null
        private set

    @Volatile
    var activeGroupId: String? = null
        private set

    fun markActive(threadId: String) {
        activeThreadId = threadId
        if (_unread.value.containsKey(threadId)) {
            _unread.update { it - threadId }
            save(_unread.value, "dmUnreadCounts")
        }
    }

    fun clearActive() {
        activeThreadId = null
    }

    fun markGroupActive(groupId: String) {
        activeGroupId = groupId
        if (_groupUnread.value.containsKey(groupId)) {
            _groupUnread.update { it - groupId }
            save(_groupUnread.value, "groupUnreadCounts")
        }
    }

    fun clearGroupActive() {
        activeGroupId = null
    }

    fun increment(threadId: String, senderId: String, currentUserId: String?) {
        if (senderId == currentUserId || threadId == activeThreadId) return
        _unread.update { it + (threadId to (it[threadId] ?: 0) + 1) }
        save(_unread.value, "dmUnreadCounts")
    }

    fun incrementGroup(groupId: String, senderId: String, currentUserId: String?) {
        if (senderId == currentUserId || groupId == activeGroupId) return
        _groupUnread.update { it + (groupId to (it[groupId] ?: 0) + 1) }
        save(_groupUnread.value, "groupUnreadCounts")
    }

    fun count(threadId: String): Int = _unread.value[threadId] ?: 0
    fun countGroup(groupId: String): Int = _groupUnread.value[groupId] ?: 0

    fun seedUnread(counts: Map<String, Int>) {
        _unread.value = counts
        save(counts, "dmUnreadCounts")
    }

    fun seedGroupUnread(counts: Map<String, Int>) {
        _groupUnread.value = counts
        save(counts, "groupUnreadCounts")
    }

    private fun load(key: String): Map<String, Int> {
        val raw = prefs.getString(key, null) ?: return emptyMap()
        return runCatching {
            json.decodeFromString(MapSerializer(String.serializer(), Int.serializer()), raw)
        }.getOrDefault(emptyMap())
    }

    private fun save(map: Map<String, Int>, key: String) {
        prefs.edit().putString(key, json.encodeToString(
            MapSerializer(String.serializer(), Int.serializer()), map,
        )).apply()
    }
}