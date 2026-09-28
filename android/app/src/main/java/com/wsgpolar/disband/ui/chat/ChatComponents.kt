package com.wsgpolar.disband.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import com.wsgpolar.disband.ui.main.hidesDock
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.core.Palette
import com.wsgpolar.disband.core.TimeFormat
import com.wsgpolar.disband.data.AttachmentType
import com.wsgpolar.disband.data.StoredAttachment
import com.wsgpolar.disband.data.resolveAttachments
import com.wsgpolar.disband.data.Profile
import com.wsgpolar.disband.data.Server
import com.wsgpolar.disband.ui.AvatarImage
import com.wsgpolar.disband.ui.main.ShellChromeState

/** Display row for any message kind (DM / channel / group). */
data class ChatRow(
    val id: String,
    val author: Profile?,
    /** Raw author id — needed when realtime payloads arrive without the profiles embed. */
    val authorId: String? = null,
    val content: String,
    val attachmentType: AttachmentType?,
    val createdAt: String,
    /** Original filename and byte size, so a file is not just "Attachment". */
    val attachmentName: String? = null,
    val attachmentSize: Int? = null,
    /** The row carried no url at all, so an image could only ever be the
     *  word "Photo". Everything the renderer needs is here now. */
    val attachmentUrl: String? = null,
    val attachments: List<StoredAttachment>? = null,
    val replyToId: String? = null,
    val editedAt: String? = null,
    val pending: Boolean = false,
    /** Replies to you and @mentions of you, which the row tints. */
    val pingsYou: Boolean = false,
    val reactions: List<ReactionSummaryRow> = emptyList(),
) {
    /** The array when there is one, otherwise a set of one from the legacy
     *  columns — see `resolveAttachments`. */
    fun resolvedAttachments(): List<StoredAttachment> =
        resolveAttachments(attachments, attachmentUrl, attachmentType, attachmentName, attachmentSize)
}

/** One emoji on a message, with how many people used it. */
data class ReactionSummaryRow(
    val emoji: String,
    val count: Int,
    /** True when the signed-in user is one of them. */
    val reacted: Boolean,
)

/** Human-readable byte counts, matching the other clients. */
internal fun formatFileSize(bytes: Int?): String? {
    if (bytes == null || bytes <= 0) return null
    val units = listOf("B", "KB", "MB", "GB")
    var value = bytes.toDouble()
    var unit = 0
    while (value >= 1024 && unit < units.lastIndex) {
        value /= 1024
        unit++
    }
    return if (value >= 10 || unit == 0) "${value.toInt()} ${units[unit]}"
    else String.format("%.1f %s", value, units[unit])
}

fun ChatRow.fromProfile() = author

/**
 * Message list + composer with a simple top bar, used by DM / channel / group
 * screens. Pure presentation; the caller owns the rows and send logic.
 */
@Composable
fun ChatScaffold(
    title: String,
    subtitle: String,
    avatarUrl: String?,
    avatarName: String,
    ownUserId: String?,
    rows: List<ChatRow>,
    loading: Boolean,
    emptyText: String,
    callAction: (@Composable () -> Unit)? = null,
    onSend: (String) -> Unit,
    sendEnabled: Boolean = true,
    onBack: () -> Unit,
    shellChrome: ShellChromeState? = null,
    typingUsers: List<Profile> = emptyList(),
    replyTo: ChatRow? = null,
    onReplyDismiss: (() -> Unit)? = null,
    /** Message id and emoji. Adds the reaction, or takes it back. */
    onToggleReaction: (String, String) -> Unit = { _, _ -> },
) {
    val palette = LocalPalette.current
    val listState = rememberLazyListState()

    LaunchedEffect(rows.size) {
        if (rows.isNotEmpty()) listState.scrollToItem(rows.lastIndex)
    }

    Column(
        Modifier
            .fillMaxSize()
            .background(palette.background)
            .then(shellChrome?.let { Modifier.hidesDock(it) } ?: Modifier)
            .imePadding(),
    ) {
        ChatTopBar(
            title = title,
            subtitle = subtitle,
            avatarUrl = avatarUrl,
            avatarName = avatarName,
            callAction = callAction,
            onBack = onBack,
        )
        HorizontalDivider(color = palette.divider)
        if (replyTo != null) {
            ReplyBanner(row = replyTo, onDismiss = onReplyDismiss ?: {})
        }
        if (typingUsers.isNotEmpty()) {
            TypingBubble(users = typingUsers, palette = palette)
        }
        Box(Modifier.fillMaxWidth().weight(1f)) {
            when {
                loading && rows.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = palette.accent)
                }
                rows.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(emptyText, color = palette.textMuted, fontSize = 15.sp)
                }
                else -> MessageList(listState, rows, ownUserId, onToggleReaction)
            }
        }
        Composer(palette = palette, onSend = onSend, enabled = sendEnabled)
    }
}

@Composable
private fun ChatTopBar(
    title: String,
    subtitle: String,
    avatarUrl: String?,
    avatarName: String,
    callAction: (@Composable () -> Unit)?,
    onBack: () -> Unit,
) {
    val palette = LocalPalette.current
    Row(
        Modifier
            .fillMaxWidth()
            .background(palette.surface)
            .statusBarsPadding()
            .height(56.dp)
            .padding(horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onBack) {
            Icon(
                Icons.AutoMirrored.Filled.ArrowBack,
                contentDescription = "Back",
                tint = palette.textPrimary,
            )
        }
        AvatarImage(url = avatarUrl, name = avatarName, size = 36.dp)
        Column(Modifier.padding(start = 10.dp).weight(1f)) {
            Text(title, color = palette.textPrimary, fontSize = 16.sp, fontWeight = FontWeight.SemiBold,
                maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (subtitle.isNotBlank()) {
                Text(subtitle, color = palette.textMuted, fontSize = 12.sp, maxLines = 1,
                    overflow = TextOverflow.Ellipsis)
            }
        }
        callAction?.invoke()
    }
}

@Composable
private fun MessageList(
    listState: LazyListState,
    rows: List<ChatRow>,
    ownUserId: String?,
    onToggleReaction: (String, String) -> Unit = { _, _ -> },
) {
    val palette = LocalPalette.current
    // Looked up once per list rather than per row: a reply preview needs the
    // message it points at, and scanning the whole list for each row is
    // quadratic on a long channel.
    val byId = remember(rows) { rows.associateBy { it.id } }

    LazyColumn(
        Modifier.fillMaxSize(),
        state = listState,
        // No gap: a run of messages from one person should read as one block,
        // and the row adds its own spacing when a run breaks.
        verticalArrangement = Arrangement.spacedBy(0.dp),
    ) {
        itemsIndexed(rows, key = { _, row -> row.id }) { index, row ->
            MessageRow(
                row = row,
                palette = palette,
                grouped = row.groupsWith(rows.getOrNull(index - 1)),
                repliedTo = row.replyToId?.let { byId[it] },
                onToggleReaction = { emoji -> onToggleReaction(row.id, emoji) },
            )
        }
        item { Spacer(Modifier.height(8.dp)) }
    }
}

/**
 * Whether this message continues a run from the same person.
 *
 * Same author, and close enough in time that it reads as one thought. Seven
 * minutes is what the web uses; past that a new header makes the gap visible
 * rather than pretending the conversation never paused.
 */
private fun ChatRow.groupsWith(previous: ChatRow?): Boolean {
    if (previous == null) return false
    if (previous.authorId != authorId || authorId == null) return false
    if (replyToId != null) return false
    val gap = TimeFormat.minutesBetween(previous.createdAt, createdAt) ?: return false
    return gap in 0..7
}

@Composable
private fun ReplyBanner(row: ChatRow, onDismiss: () -> Unit) {
    val palette = LocalPalette.current
    Row(
        Modifier.fillMaxWidth().background(palette.surfaceRaised).padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text("Replying to ${row.author?.name ?: "Unknown"}", color = palette.accent, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            Text(row.content, color = palette.textSecondary, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        IconButton(onClick = onDismiss) {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Dismiss reply", tint = palette.textMuted, modifier = Modifier.size(18.dp))
        }
    }
    HorizontalDivider(color = palette.divider)
}

@Composable
private fun TypingBubble(users: List<Profile>, palette: Palette) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("${users.firstOrNull()?.name ?: "Someone"} is typing...", color = palette.textMuted, fontSize = 13.sp, fontStyle = androidx.compose.ui.text.font.FontStyle.Italic)
    }
}

@Composable
private fun Composer(palette: Palette, onSend: (String) -> Unit, enabled: Boolean) {
    var text by remember { mutableStateOf("") }
    Row(
        Modifier
            .fillMaxWidth()
            .background(palette.surface)
            .navigationBarsPadding()
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.Bottom,
    ) {
        OutlinedTextField(
            value = text,
            onValueChange = { text = it },
            modifier = Modifier.weight(1f),
            placeholder = { Text("Message", color = palette.textMuted) },
            maxLines = 4,
            shape = RoundedCornerShape(18.dp),
        )
        Spacer(Modifier.width(6.dp))
        IconButton(
            onClick = {
                val trimmed = text.trim()
                if (trimmed.isNotEmpty()) {
                    onSend(trimmed)
                    text = ""
                }
            },
            enabled = enabled && text.isNotBlank(),
            modifier = Modifier.size(44.dp),
        ) {
            Icon(Icons.Filled.Send, contentDescription = "Send", tint = palette.accent)
        }
    }
}