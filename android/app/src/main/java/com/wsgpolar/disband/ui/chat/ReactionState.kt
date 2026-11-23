package com.wsgpolar.disband.ui.chat

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.wsgpolar.disband.core.leave
import com.wsgpolar.disband.data.Database
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.withContext

/**
 * Reactions for the messages on screen.
 *
 * The data layer could already read and toggle them; nothing ever called it,
 * so a message reacted to on the web or on iOS showed nothing at all on
 * Android. This holds the summary per message and keeps the optimistic path
 * honest.
 *
 * Deliberately not a ViewModel: the chat screens are plain composables with
 * their own state, and one more object with its own lifecycle would be the
 * odd one out.
 */
class ReactionState(private val contextType: String) {

    /** Message id → the emoji on it, in insertion order. */
    var byMessage by mutableStateOf<Map<String, List<ReactionSummaryRow>>>(emptyMap())
        private set

    /**
     * Load reactions for a set of messages.
     *
     * Summarised here rather than in the database: the table stores one row
     * per person per emoji, and the row wants a count and whether *you* are
     * in it.
     */
    /** Messages with a toggle still in flight; their local state wins over a reload. */
    private val pending = mutableMapOf<String, Int>()

    /**
     * Reload whenever anybody reacts. Deletes cannot be filtered server-side,
     * so ticks for other contexts are possible and just cost one cheap read.
     */
    suspend fun watch(ids: () -> List<String>, currentUserId: String) {
        while (true) {
            try {
                val live = com.wsgpolar.disband.data.RealtimeService.observeReactions(contextType)
                try {
                    live.flow.collectLatest {
                        delay(250)
                        load(ids(), currentUserId)
                    }
                } finally {
                    withContext(NonCancellable) { runCatching { live.channel.leave() } }
                }
                return
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                delay(3_000)
            }
        }
    }

    suspend fun load(messageIds: List<String>, currentUserId: String) {
        if (messageIds.isEmpty()) {
            byMessage = emptyMap()
            return
        }
        val rows = runCatching { Database.reactions(contextType, messageIds) }.getOrNull() ?: return

        val fresh = rows
            .groupBy { it.messageId }
            .mapValues { (_, forMessage) ->
                forMessage
                    .groupBy { it.emoji }
                    .map { (emoji, uses) ->
                        ReactionSummaryRow(
                            emoji = emoji,
                            count = uses.size,
                            reacted = uses.any { it.userId == currentUserId },
                            userIds = uses.map { it.userId },
                        )
                    }
                    // Most-used first, then alphabetically, so the order does
                    // not jump around as counts change.
                    .sortedWith(compareByDescending<ReactionSummaryRow> { it.count }.thenBy { it.emoji })
            }
        // Keep what an in-flight toggle shows; the server hasn't caught up yet.
        val kept = pending.keys.filter { it in messageIds }.associateWith { byMessage[it].orEmpty() }
        byMessage = fresh.filterKeys { it !in kept } + kept.filterValues { it.isNotEmpty() }
    }

    /**
     * Add or remove one reaction.
     *
     * The chip updates before the write lands and rolls back if it fails —
     * a tap that does nothing for a round trip reads as a broken button, and
     * a tap that lies is worse.
     */
    suspend fun toggle(messageId: String, emoji: String, currentUserId: String) {
        val current = byMessage[messageId].orEmpty()
        val existing = current.firstOrNull { it.emoji == emoji }
        val wasReacted = existing?.reacted == true

        val optimistic = when {
            existing == null ->
                current + ReactionSummaryRow(emoji, 1, reacted = true)
            wasReacted && existing.count <= 1 ->
                current.filterNot { it.emoji == emoji }
            wasReacted ->
                current.map { if (it.emoji == emoji) it.copy(count = it.count - 1, reacted = false) else it }
            else ->
                current.map { if (it.emoji == emoji) it.copy(count = it.count + 1, reacted = true) else it }
        }
        byMessage = byMessage + (messageId to optimistic)
        pending[messageId] = (pending[messageId] ?: 0) + 1

        val ok = try {
            runCatching {
                Database.toggleReaction(contextType, messageId, currentUserId, emoji, wasReacted)
            }.isSuccess
        } finally {
            val left = (pending[messageId] ?: 1) - 1
            if (left <= 0) pending.remove(messageId) else pending[messageId] = left
        }

        if (!ok) byMessage = byMessage + (messageId to current)
    }

    /** Merge the loaded summaries onto a list of rows for rendering. */
    fun applyTo(rows: List<ChatRow>): List<ChatRow> {
        if (byMessage.isEmpty()) return rows
        return rows.map { row ->
            val forRow = byMessage[row.id]
            if (forRow.isNullOrEmpty()) row else row.copy(reactions = forRow)
        }
    }
}
