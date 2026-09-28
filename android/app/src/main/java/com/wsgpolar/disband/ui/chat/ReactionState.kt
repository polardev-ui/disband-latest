package com.wsgpolar.disband.ui.chat

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.wsgpolar.disband.data.Database

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
    suspend fun load(messageIds: List<String>, currentUserId: String) {
        if (messageIds.isEmpty()) {
            byMessage = emptyMap()
            return
        }
        val rows = runCatching { Database.reactions(contextType, messageIds) }.getOrNull() ?: return

        byMessage = rows
            .groupBy { it.messageId }
            .mapValues { (_, forMessage) ->
                forMessage
                    .groupBy { it.emoji }
                    .map { (emoji, uses) ->
                        ReactionSummaryRow(
                            emoji = emoji,
                            count = uses.size,
                            reacted = uses.any { it.userId == currentUserId },
                        )
                    }
                    // Most-used first, then alphabetically, so the order does
                    // not jump around as counts change.
                    .sortedWith(compareByDescending<ReactionSummaryRow> { it.count }.thenBy { it.emoji })
            }
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

        val ok = runCatching {
            Database.toggleReaction(contextType, messageId, currentUserId, emoji, wasReacted)
        }.isSuccess

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
