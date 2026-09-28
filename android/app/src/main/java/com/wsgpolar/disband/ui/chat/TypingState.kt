package com.wsgpolar.disband.ui.chat

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.wsgpolar.disband.data.Profile
import com.wsgpolar.disband.data.TypingService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Who is typing in this conversation, and telling everyone else that you are.
 *
 * Two timings matter and they are not the same number:
 *
 *  - **How often you announce** ([SEND_EVERY_MS]). A broadcast per keystroke
 *    would be a message per character; one every few seconds is enough for
 *    the other end to keep the indicator alive.
 *  - **How long a typer stays shown** ([EXPIRE_AFTER_MS]). There is no "I
 *    stopped" event — the other client just goes quiet — so each typer is
 *    dropped when their last ping gets old. This has to be comfortably longer
 *    than the send interval or the indicator strobes.
 */
class TypingState(
    private val kind: String,
    private val parentId: String,
    private val scope: CoroutineScope,
) {
    companion object {
        private const val SEND_EVERY_MS = 3_000L
        private const val EXPIRE_AFTER_MS = 7_000L
        private const val MAX_SHOWN = 3
    }

    /** Typers other than you, most recent first, capped for display. */
    var typers by mutableStateOf<List<Profile>>(emptyList())
        private set

    private val lastSeen = mutableMapOf<String, Long>()
    private val names = mutableMapOf<String, String>()
    private var lastSentAt = 0L
    private var watchJob: Job? = null
    private var sweepJob: Job? = null

    fun start(currentUserId: String, profileFor: suspend (String) -> Profile?) {
        if (watchJob != null) return
        val topic = TypingService.topic(kind, parentId)

        watchJob = scope.launch {
            val (channel, flow) = runCatching { TypingService.watch(topic) }.getOrNull()
                ?: return@launch
            try {
                flow.collect { payload ->
                    // Your own keystrokes come back on the same topic.
                    if (payload.userId == currentUserId) return@collect
                    lastSeen[payload.userId] = System.currentTimeMillis()
                    names[payload.userId] = payload.name
                    refresh(profileFor)
                }
            } finally {
                runCatching { channel.unsubscribe() }
            }
        }

        // Nobody sends a "stopped typing", so expiry is on us.
        sweepJob = scope.launch {
            while (isActive) {
                delay(1_000)
                val cutoff = System.currentTimeMillis() - EXPIRE_AFTER_MS
                val stale = lastSeen.filterValues { it < cutoff }.keys
                if (stale.isNotEmpty()) {
                    stale.forEach { lastSeen.remove(it); names.remove(it) }
                    refresh(profileFor)
                }
            }
        }
    }

    private suspend fun refresh(profileFor: suspend (String) -> Profile?) {
        val ids = lastSeen.entries.sortedByDescending { it.value }.map { it.key }.take(MAX_SHOWN)
        typers = ids.mapNotNull { id ->
            profileFor(id) ?: names[id]?.let { Profile(id = id, username = it, displayName = it) }
        }
    }

    /** Called on every keystroke; throttled to one broadcast per interval. */
    fun noteTyping(currentUserId: String, displayName: String) {
        val now = System.currentTimeMillis()
        if (now - lastSentAt < SEND_EVERY_MS) return
        lastSentAt = now
        scope.launch {
            TypingService.send(TypingService.topic(kind, parentId), currentUserId, displayName)
        }
    }

    fun stop() {
        watchJob?.cancel()
        sweepJob?.cancel()
        watchJob = null
        sweepJob = null
        typers = emptyList()
        lastSeen.clear()
        names.clear()
    }
}
