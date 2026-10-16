package com.wsgpolar.disband.data

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * DMs the user closed from the Messages list — the Android twin of the iOS
 * `ClosedDmStore` and the web's per-user `disband:closed-dms:` keys.
 *
 * Closing hides the row; a new message from that friend (which shows up as
 * unread) or opening the chat again brings the row back, history intact.
 * Persisted per account so one user's closed list never leaks into another's.
 */
class ClosedDmStore(context: Context) {
    private val prefs = context.getSharedPreferences("disband_closed_dms", Context.MODE_PRIVATE)

    @Volatile
    private var userId: String? = null

    private val _closed = MutableStateFlow<Set<String>>(emptySet())
    val closed: StateFlow<Set<String>> = _closed.asStateFlow()

    /** Called when the signed-in account changes; null clears (sign-out). */
    fun activate(uid: String?) {
        if (uid == userId) return
        userId = uid
        _closed.value = if (uid == null) emptySet()
        else prefs.getStringSet(key(uid), emptySet())?.toSet() ?: emptySet()
    }

    fun isClosed(friendId: String?): Boolean = friendId != null && _closed.value.contains(friendId)

    fun close(friendId: String) {
        if (_closed.value.contains(friendId)) return
        _closed.value = _closed.value + friendId
        persist()
    }

    fun unhide(friendId: String?) {
        if (friendId == null || !_closed.value.contains(friendId)) return
        _closed.value = _closed.value - friendId
        persist()
    }

    private fun persist() {
        val uid = userId ?: return
        prefs.edit().putStringSet(key(uid), _closed.value).apply()
    }

    private fun key(uid: String) = "closed:$uid"
}
