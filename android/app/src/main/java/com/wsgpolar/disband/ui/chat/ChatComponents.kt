package com.wsgpolar.disband.ui.chat

import androidx.compose.foundation.background
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.border
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.filled.AddPhotoAlternate
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import coil.compose.AsyncImage
import com.wsgpolar.disband.core.Brand
import com.wsgpolar.disband.data.MAX_ATTACHMENTS
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
    /** Staged images, and the caption-and-send that flushes them. */
    attachments: AttachmentSender? = null,
    onSendAttachments: ((String) -> Unit)? = null,
    /** Fired on every keystroke; the caller throttles the broadcast. */
    onTyping: () -> Unit = {},
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
            // Floating, not stacked: as a row it pushed the composer and the
            // last message down a line every time somebody started typing,
            // and back up when they stopped.
            androidx.compose.animation.AnimatedVisibility(
                visible = typingUsers.isNotEmpty(),
                enter = fadeIn() + slideInVertically { it / 2 } + scaleIn(initialScale = 0.92f),
                exit = fadeOut() + slideOutVertically { it / 2 } + scaleOut(targetScale = 0.92f),
                modifier = Modifier.align(Alignment.BottomStart),
            ) {
                TypingBubble(users = typingUsers, palette = palette)
            }
        }
        Composer(
            palette = palette,
            onSend = onSend,
            enabled = sendEnabled,
            attachments = attachments,
            onSendAttachments = onSendAttachments,
            onTyping = onTyping,
        )
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
                // A message arriving pops into place with no transition,
                // which reads as a jump when the list is already at the
                // bottom. Keyed items let Compose tween the insertion, and
                // the same animation covers a message being deleted.
                modifier = Modifier.animateItem(),
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
        Modifier
            .padding(start = 16.dp, bottom = 6.dp)
            .clip(RoundedCornerShape(50))
            .background(palette.elevated)
            .padding(start = 6.dp, end = 10.dp, top = 5.dp, bottom = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Up to three faces, overlapping. Past three it counts the rest
        // rather than growing — the pill has to stay narrow enough not to
        // cover the conversation it sits on.
        Row(horizontalArrangement = Arrangement.spacedBy((-8).dp)) {
            users.take(3).forEach { person ->
                Box(Modifier.border(2.dp, palette.elevated, RoundedCornerShape(50))) {
                    AvatarImage(url = person.avatarUrl, name = person.name, size = 22.dp)
                }
            }
        }
        Spacer(Modifier.width(8.dp))
        TypingDots(palette)
    }
}

/** Three dots pulsing a third of a cycle apart, so the pulse travels. */
@Composable
private fun TypingDots(palette: Palette) {
    val transition = rememberInfiniteTransition(label = "typing")
    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        repeat(3) { index ->
            val alpha by transition.animateFloat(
                initialValue = 0.35f,
                targetValue = 1f,
                animationSpec = infiniteRepeatable(
                    animation = tween(600, delayMillis = index * 160),
                    repeatMode = RepeatMode.Reverse,
                ),
                label = "dot$index",
            )
            Box(
                Modifier
                    .size(6.dp)
                    .clip(RoundedCornerShape(50))
                    .background(palette.textMuted.copy(alpha = alpha))
            )
        }
    }
}

@Composable
private fun Composer(
    palette: Palette,
    onSend: (String) -> Unit,
    enabled: Boolean,
    attachments: AttachmentSender? = null,
    onSendAttachments: ((String) -> Unit)? = null,
    onTyping: () -> Unit = {},
) {
    var text by remember { mutableStateOf("") }
    val picker = attachments?.let {
        rememberLauncherForActivityResult(
            ActivityResultContracts.PickMultipleVisualMedia(MAX_ATTACHMENTS)
        ) { uris -> if (uris.isNotEmpty()) it.stage(uris) }
    }

    Column(
        Modifier
            .fillMaxWidth()
            .background(palette.surface)
            .navigationBarsPadding(),
    ) {
        // What is about to be sent, with a way to take any of it back out.
        if (attachments != null && attachments.staged.isNotEmpty()) {
            StagedStrip(attachments, palette)
        }
        attachments?.progress?.let { fraction ->
            LinearProgressIndicator(
                progress = { fraction },
                modifier = Modifier.fillMaxWidth().height(2.dp),
                color = palette.accent,
                trackColor = palette.elevated,
            )
        }
        attachments?.error?.let { message ->
            Text(
                message,
                color = Brand.dnd,
                fontSize = 12.sp,
                modifier = Modifier.padding(horizontal = 14.dp, vertical = 4.dp),
            )
        }

    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.Bottom,
    ) {
        if (picker != null) {
            IconButton(
                onClick = {
                    picker.launch(
                        PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageAndVideo)
                    )
                },
                enabled = enabled,
                modifier = Modifier.size(44.dp),
            ) {
                Icon(Icons.Filled.AddPhotoAlternate, contentDescription = "Attach", tint = palette.textMuted)
            }
            Spacer(Modifier.width(2.dp))
        }
        OutlinedTextField(
            value = text,
            onValueChange = {
                val wasEmpty = text.isEmpty()
                text = it
                // Only while actually writing something. Clearing the field
                // is not typing, and neither is the deletion that empties it.
                if (it.isNotEmpty() && !(wasEmpty && it.isEmpty())) onTyping()
            },
            modifier = Modifier.weight(1f),
            placeholder = { Text("Message", color = palette.textMuted) },
            maxLines = 4,
            shape = RoundedCornerShape(18.dp),
        )
        Spacer(Modifier.width(6.dp))
        val hasStaged = attachments?.staged?.isNotEmpty() == true
        IconButton(
            onClick = {
                val trimmed = text.trim()
                when {
                    hasStaged && onSendAttachments != null -> {
                        onSendAttachments(trimmed)
                        text = ""
                    }
                    trimmed.isNotEmpty() -> {
                        onSend(trimmed)
                        text = ""
                    }
                }
            },
            // An image on its own is a message; it does not need a caption.
            enabled = enabled && (text.isNotBlank() || hasStaged),
            modifier = Modifier.size(44.dp),
        ) {
            Icon(Icons.Filled.Send, contentDescription = "Send", tint = palette.accent)
        }
    }
    }
}

/** Thumbnails of what is about to be sent, each with a way to remove it. */
@Composable
private fun StagedStrip(attachments: AttachmentSender, palette: Palette) {
    Row(
        Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 12.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        attachments.staged.forEach { uri ->
            Box {
                AsyncImage(
                    model = uri,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .size(64.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(palette.elevated),
                )
                Box(
                    Modifier
                        .align(Alignment.TopEnd)
                        .padding(2.dp)
                        .size(18.dp)
                        .clip(RoundedCornerShape(50))
                        .background(Color.Black.copy(alpha = 0.6f))
                        .clickable { attachments.unstage(uri) },
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        Icons.Filled.Close,
                        contentDescription = "Remove",
                        tint = Color.White,
                        modifier = Modifier.size(12.dp),
                    )
                }
            }
        }
    }
}