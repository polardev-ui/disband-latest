package com.wsgpolar.disband.ui.chat

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.spring
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.widthIn
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.TextStyle
import kotlinx.coroutines.launch
import kotlinx.coroutines.CancellationException
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
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.KeyboardArrowDown
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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.ime
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Reply
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
    conversationKey: String = title,
    hasOlder: Boolean = false,
    loadingOlder: Boolean = false,
    onLoadOlder: () -> Unit = {},
    callAction: (@Composable () -> Unit)? = null,
    onSend: suspend (String) -> Boolean,
    sendEnabled: Boolean = true,
    sendPlaceholder: String = "Message",
    sendHint: String? = null,
    loadError: String? = null,
    onRetryLoad: (() -> Unit)? = null,
    onBack: () -> Unit,
    shellChrome: ShellChromeState? = null,
    typingUsers: List<Profile> = emptyList(),
    replyTo: ChatRow? = null,
    onReplyDismiss: (() -> Unit)? = null,
    /** Message id and emoji. Adds the reaction, or takes it back. */
    onToggleReaction: (String, String) -> Unit = { _, _ -> },
    onOpenAttachment: (StoredAttachment) -> Unit = {},
    onMessageLongPress: (ChatRow) -> Unit = {},
    editingRow: ChatRow? = null,
    onEditDismiss: (() -> Unit)? = null,
    /** Staged images, and the caption-and-send that flushes them. */
    attachments: AttachmentSender? = null,
    onSendAttachments: (suspend (String) -> Boolean)? = null,
    /** Fired on every keystroke; the caller throttles the broadcast. */
    onTyping: () -> Unit = {},
) {
    val palette = LocalPalette.current
    val listState = rememberLazyListState()
    var profileFor by remember { mutableStateOf<Profile?>(null) }
    profileFor?.let { UserProfileSheet(initial = it, onDismiss = { profileFor = null }) }

    val scope = rememberCoroutineScope()
    BackHandler(onBack = onBack)
    var followLatest by rememberSaveable(conversationKey) { mutableStateOf(true) }
    var previousLastId by rememberSaveable(conversationKey) { mutableStateOf<String?>(null) }
    val showJumpToBottom by remember { derivedStateOf {
        listState.canScrollForward && !followLatest
    } }
    LaunchedEffect(listState) {
        snapshotFlow { listState.isScrollInProgress to listState.canScrollForward }
            .collect { (scrolling, canScroll) ->
                if (scrolling) followLatest = !canScroll
            }
    }
    LaunchedEffect(rows.lastOrNull()?.id) {
        val last = rows.lastOrNull() ?: return@LaunchedEffect
        val firstLoad = previousLastId == null
        if (firstLoad || followLatest || (last.id != previousLastId && last.authorId == ownUserId)) {
            if (firstLoad) listState.scrollToItem(rows.lastIndex + 1)
            else listState.animateScrollToItem(rows.lastIndex + 1)
            followLatest = true
        }
        previousLastId = last.id
    }

    val keyboardBottom = androidx.compose.foundation.layout.WindowInsets.ime.getBottom(androidx.compose.ui.platform.LocalDensity.current)
    LaunchedEffect(keyboardBottom) {
        if (followLatest && rows.isNotEmpty()) listState.scrollToItem(rows.size)
    }

    Column(
        Modifier
            .fillMaxSize()
            .background(palette.background)
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
        if (replyTo != null) {
            ReplyBanner(row = replyTo, onDismiss = onReplyDismiss ?: {})
        }
        if (editingRow != null) {
            EditBanner(row = editingRow, onDismiss = onEditDismiss ?: {})
        }
        Box(Modifier.fillMaxWidth().weight(1f)) {
            when {
                loading && rows.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = palette.accent)
                }
                loadError != null && rows.isEmpty() -> com.wsgpolar.disband.ui.components.ErrorState(
                    message = loadError,
                    onRetry = { onRetryLoad?.invoke() },
                )
                rows.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.padding(horizontal = 32.dp),
                    ) {
                        AvatarImage(url = avatarUrl, name = avatarName, size = 64.dp)
                        Spacer(Modifier.height(18.dp))
                        Text(title, color = palette.textPrimary, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.height(6.dp))
                        Text(emptyText, color = palette.textMuted, fontSize = 15.sp)
                        sendHint?.let {
                            Spacer(Modifier.height(6.dp))
                            Text(it, color = palette.textMuted.copy(alpha = 0.7f), fontSize = 13.sp)
                        }
                    }
                }
                else -> MessageList(
                    listState, rows, ownUserId,
                    onToggleReaction = onToggleReaction,
                    onOpenAttachment = onOpenAttachment,
                    onLongPress = onMessageLongPress,
                    onAuthorClick = { row ->
                        (row.author ?: row.authorId?.let { Profile(id = it) })?.let { profileFor = it }
                    },
                    hasOlder = hasOlder,
                    loadingOlder = loadingOlder,
                    onLoadOlder = onLoadOlder,
                )
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
            androidx.compose.animation.AnimatedVisibility(
                visible = showJumpToBottom,
                enter = fadeIn() + scaleIn(initialScale = 0.8f),
                exit = fadeOut() + scaleOut(targetScale = 0.8f),
                modifier = Modifier.align(Alignment.BottomEnd).padding(end = 16.dp, bottom = 12.dp),
            ) {
                androidx.compose.material3.FloatingActionButton(
                    onClick = {
                        followLatest = true
                        scope.launch { listState.animateScrollToItem(rows.size) }
                    },
                    modifier = Modifier.size(44.dp),
                    shape = CircleShape,
                    containerColor = palette.elevated,
                    contentColor = palette.textPrimary,
                ) {
                    Icon(
                        Icons.Filled.KeyboardArrowDown,
                        contentDescription = "Jump to latest messages",
                        modifier = Modifier.size(22.dp),
                    )
                }
            }
        }
        val notice = sendHint ?: loadError?.takeIf { rows.isNotEmpty() }
        if (notice != null) {
            Text(
                notice,
                color = if (sendEnabled) Brand.dnd else palette.textMuted,
                fontSize = 12.sp,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 10.dp, vertical = 4.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(if (sendEnabled) Brand.dnd.copy(alpha = 0.10f) else palette.surfaceRaised)
                    .padding(horizontal = 14.dp, vertical = 10.dp),
            )
        }
        Composer(
            palette = palette,
            onSend = onSend,
            conversationKey = conversationKey,
            editingRow = editingRow,
            enabled = sendEnabled,
            placeholder = sendPlaceholder,
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
            .heightIn(min = 60.dp)
            .padding(horizontal = 8.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Circular back chevron mirroring iOS — 48dp target, not the old
        // square edge-to-edge arrow.
        Box(
            Modifier
                .size(48.dp)
                .clip(CircleShape)
                .background(palette.elevated)
                .clickable(role = androidx.compose.ui.semantics.Role.Button, onClickLabel = "Back", onClick = onBack),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.AutoMirrored.Filled.ArrowBack,
                contentDescription = null,
                tint = palette.textPrimary,
                modifier = Modifier.size(20.dp),
            )
        }
        Row(
            Modifier.weight(1f).padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center,
        ) {
            AvatarImage(url = avatarUrl, name = avatarName, size = 34.dp)
            Column(Modifier.padding(start = 9.dp).weight(1f, fill = false)) {
                Text(title, color = palette.textPrimary, fontSize = 16.sp, fontWeight = FontWeight.SemiBold,
                    maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (subtitle.isNotBlank()) Text(subtitle, color = palette.textMuted, fontSize = 12.sp,
                    maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        if (callAction != null) callAction() else Spacer(Modifier.size(48.dp))
    }
}

@Composable
private fun MessageList(
    listState: LazyListState,
    rows: List<ChatRow>,
    ownUserId: String?,
    onToggleReaction: (String, String) -> Unit = { _, _ -> },
    onOpenAttachment: (StoredAttachment) -> Unit = {},
    onLongPress: (ChatRow) -> Unit = {},
    onAuthorClick: (ChatRow) -> Unit = {},
    hasOlder: Boolean,
    loadingOlder: Boolean,
    onLoadOlder: () -> Unit,
) {
    val palette = LocalPalette.current
    // Looked up once per list rather than per row: a reply preview needs the
    // message it points at, and scanning the whole list for each row is
    // quadratic on a long channel.
    val byId = remember(rows) { rows.associateBy { it.id } }
    val days = remember(rows) { rows.map { TimeFormat.parse(it.createdAt)?.atZone(java.time.ZoneId.systemDefault())?.toLocalDate() } }

    LazyColumn(
        Modifier.fillMaxSize(),
        state = listState,
        // No gap: a run of messages from one person should read as one block,
        // and the row adds its own spacing when a run breaks.
        verticalArrangement = Arrangement.spacedBy(0.dp),
        contentPadding = PaddingValues(top = 12.dp, bottom = 24.dp),
    ) {
        item(key = "history", contentType = "history") {
            Box(Modifier.fillMaxWidth().padding(bottom = 12.dp), contentAlignment = Alignment.Center) {
                if (loadingOlder) CircularProgressIndicator(Modifier.size(20.dp), color = palette.accent, strokeWidth = 2.dp)
                else if (hasOlder) androidx.compose.material3.TextButton(onClick = onLoadOlder) {
                    Text("Load earlier messages", color = palette.accent, fontSize = 13.sp)
                }
            }
        }
        itemsIndexed(rows, key = { _, row -> row.id }, contentType = { _, _ -> "message" }) { index, row ->
            Column(Modifier.animateItem()) {
            val day = days[index]
            if (day != null && day != days.getOrNull(index - 1)) {
                val today = java.time.LocalDate.now()
                val label = when (day) {
                    today -> "Today"
                    today.minusDays(1) -> "Yesterday"
                    else -> TimeFormat.dayHeader(day)
                }
                Box(Modifier.fillMaxWidth().padding(vertical = 14.dp), contentAlignment = Alignment.Center) {
                    Text(label, color = palette.textMuted, fontSize = 11.sp, fontWeight = FontWeight.Medium,
                        modifier = Modifier.clip(CircleShape).background(palette.surface).padding(horizontal = 12.dp, vertical = 5.dp))
                }
            }
            MessageRow(
                // A message arriving pops into place with no transition,
                // which reads as a jump when the list is already at the
                // bottom. Keyed items let Compose tween the insertion, and
                // the same animation covers a message being deleted.
                modifier = Modifier,
                row = row,
                palette = palette,
                grouped = day == days.getOrNull(index - 1) && row.groupsWith(rows.getOrNull(index - 1)),
                repliedTo = row.replyToId?.let { byId[it] },
                onToggleReaction = { emoji -> onToggleReaction(row.id, emoji) },
                onOpenAttachment = onOpenAttachment,
                onLongPress = { onLongPress(row) },
                onAuthorClick = { onAuthorClick(row) },
            )
            }
        }
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
        IconButton(onClick = onDismiss, modifier = Modifier.size(48.dp)) {
            Icon(Icons.Filled.Close, contentDescription = "Dismiss reply", tint = palette.textMuted, modifier = Modifier.size(18.dp))
        }
    }
    HorizontalDivider(color = palette.divider)
}

@Composable
private fun EditBanner(row: ChatRow, onDismiss: () -> Unit) {
    val palette = LocalPalette.current
    Row(
        Modifier.fillMaxWidth().background(palette.accent.copy(alpha = 0.12f)).padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text("Editing message", color = palette.accent, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            Text(row.content, color = palette.textSecondary, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        IconButton(onClick = onDismiss, modifier = Modifier.size(48.dp)) {
            Icon(Icons.Filled.Close, contentDescription = "Cancel editing", tint = palette.textMuted, modifier = Modifier.size(18.dp))
        }
    }
    HorizontalDivider(color = palette.divider)
}

/**
 * Long-press actions for a message, mirroring iOS reaction tray + context
 * menu: quick reactions, Reply, Copy, Edit (own), Delete (own).
 */
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
fun MessageActionSheet(
    row: ChatRow,
    isOwn: Boolean,
    onDismiss: () -> Unit,
    onCopy: () -> Unit,
    onReply: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    onReact: (String) -> Unit,
) {
    val palette = LocalPalette.current
    androidx.compose.material3.ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = androidx.compose.material3.rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = palette.surface,
    ) {
        Column(Modifier.padding(bottom = 28.dp).navigationBarsPadding()) {
            // Quick reactions.
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                listOf("❤️", "👍", "😂", "😮", "😢", "🙏").forEach { emoji ->
                    Box(
                        Modifier
                            .size(48.dp)
                            .clip(CircleShape)
                            .background(palette.elevated)
                            .clickable(
                                role = androidx.compose.ui.semantics.Role.Button,
                                onClickLabel = "React $emoji",
                                onClick = { onReact(emoji); onDismiss() },
                            ),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(emoji, fontSize = 22.sp)
                    }
                }
            }
            androidx.compose.material3.HorizontalDivider(color = palette.divider)
            SheetAction("Reply", Icons.AutoMirrored.Filled.Reply, palette) { onReply(); onDismiss() }
            SheetAction("Copy text", Icons.Filled.ContentCopy, palette) { onCopy(); onDismiss() }
            if (isOwn && row.content.isNotBlank()) {
                SheetAction("Edit", Icons.Filled.Edit, palette) { onEdit(); onDismiss() }
            }
            if (isOwn) {
                SheetAction("Delete", Icons.Filled.Delete, palette, destructive = true) { onDelete() }
            }
        }
    }
}

@Composable
private fun SheetAction(
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    palette: Palette,
    destructive: Boolean = false,
    onClick: () -> Unit,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 52.dp)
            .clickable(role = androidx.compose.ui.semantics.Role.Button, onClickLabel = label, onClick = onClick)
            .padding(horizontal = 20.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            icon,
            contentDescription = null,
            tint = if (destructive) Brand.dnd else palette.textPrimary,
            modifier = Modifier.size(20.dp),
        )
        Spacer(Modifier.width(14.dp))
        Text(
            label,
            color = if (destructive) Brand.dnd else palette.textPrimary,
            fontSize = 15.sp,
            fontWeight = FontWeight.Medium,
        )
    }
}

@Composable
private fun TypingBubble(users: List<Profile>, palette: Palette) {
    val names = users.take(3).joinToString(", ") { it.name }
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
    onSend: suspend (String) -> Boolean,
    enabled: Boolean,
    conversationKey: String,
    editingRow: ChatRow?,
    placeholder: String = "Message",
    attachments: AttachmentSender? = null,
    onSendAttachments: (suspend (String) -> Boolean)? = null,
    onTyping: () -> Unit = {},
) {
    var draft by rememberSaveable(conversationKey) { mutableStateOf("") }
    var editText by rememberSaveable(conversationKey, editingRow?.id) { mutableStateOf(editingRow?.content.orEmpty()) }
    val text = if (editingRow != null) editText else draft
    var sending by remember { mutableStateOf(false) }
    var focused by remember { mutableStateOf(false) }
    var unexpectedError by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val haptic = LocalHapticFeedback.current
    val hasStaged = attachments?.staged?.isNotEmpty() == true && editingRow == null
    val canSend = enabled && !sending && (text.isNotBlank() || hasStaged)
    val picker = attachments?.let {
        rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(MAX_ATTACHMENTS)) { uris ->
            if (uris.isNotEmpty()) it.stage(uris)
        }
    }
    val border by androidx.compose.animation.animateColorAsState(
        if (focused) palette.accent.copy(alpha = 0.55f) else palette.divider, label = "composerFocus",
    )

    Column(Modifier.fillMaxWidth().navigationBarsPadding()) {
        if (hasStaged && attachments != null) StagedStrip(attachments, palette)
        attachments?.progress?.let { progress ->
            LinearProgressIndicator(progress = { progress }, modifier = Modifier.fillMaxWidth().height(2.dp),
                color = palette.accent, trackColor = palette.elevated)
        }
        (unexpectedError ?: attachments?.error)?.let {
            Text(it, color = Brand.dnd, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 18.dp, vertical = 4.dp))
        }
        Row(
            Modifier.padding(horizontal = 10.dp, vertical = 8.dp)
                .fillMaxWidth()
                .animateContentSize(spring(stiffness = 500f))
                .clip(RoundedCornerShape(28.dp))
                .background(palette.elevated)
                .border(1.dp, border, RoundedCornerShape(28.dp))
                .padding(4.dp),
            verticalAlignment = Alignment.Bottom,
        ) {
            if (picker != null) IconButton(
                onClick = { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageAndVideo)) },
                enabled = enabled && !sending && editingRow == null,
                modifier = Modifier.size(48.dp),
            ) {
                Box(Modifier.size(34.dp).clip(CircleShape).background(palette.surface), contentAlignment = Alignment.Center) {
                    Icon(Icons.Filled.Add, "Add attachment", tint = palette.textSecondary, modifier = Modifier.size(20.dp))
                }
            } else Spacer(Modifier.width(12.dp))
            BasicTextField(
                value = text,
                onValueChange = {
                    if (editingRow != null) editText = it else draft = it
                    if (it.isNotEmpty()) onTyping()
                },
                modifier = Modifier.weight(1f).heightIn(min = 48.dp).onFocusChanged { focused = it.isFocused }
                    .padding(vertical = 13.dp, horizontal = 4.dp)
                    .semantics { contentDescription = if (editingRow != null) "Edit message" else "Message" },
                textStyle = TextStyle(color = palette.textPrimary, fontSize = 16.sp, lineHeight = 22.sp),
                cursorBrush = SolidColor(palette.accent),
                maxLines = 6,
                enabled = enabled && !sending,
                decorationBox = { field ->
                    Box {
                        if (text.isEmpty()) Text(placeholder, color = palette.textMuted, fontSize = 16.sp, maxLines = 1,
                            overflow = TextOverflow.Ellipsis)
                        field()
                    }
                },
            )
            AnimatedVisibility(visible = text.isNotBlank() || hasStaged || sending,
                enter = fadeIn(tween(160)) + scaleIn(initialScale = 0.7f),
                exit = fadeOut(tween(120)) + scaleOut(targetScale = 0.7f)) {
                IconButton(
                    onClick = {
                        if (!canSend || sending) return@IconButton
                        sending = true
                        unexpectedError = null
                        val submitted = text.trim()
                        val wasEditing = editingRow != null
                        scope.launch {
                            try {
                                val success = if (hasStaged && onSendAttachments != null) onSendAttachments(submitted)
                                    else onSend(submitted)
                                if (success) {
                                    if (wasEditing) editText = "" else draft = ""
                                    haptic.performHapticFeedback(HapticFeedbackType.Confirm)
                                }
                            } catch (e: CancellationException) { throw e }
                            catch (_: Exception) { unexpectedError = "Couldn't send. Your draft is still here." }
                            finally { sending = false }
                        }
                    },
                    enabled = canSend,
                    modifier = Modifier.size(48.dp),
                ) {
                    Box(Modifier.size(36.dp).clip(CircleShape).background(palette.accent), contentAlignment = Alignment.Center) {
                        if (sending) CircularProgressIndicator(Modifier.size(18.dp), color = Color.White, strokeWidth = 2.dp)
                        else Icon(Icons.Filled.Send, if (editingRow != null) "Save edit" else "Send message",
                            tint = Color.White, modifier = Modifier.size(18.dp))
                    }
                }
            }
            if (text.isBlank() && !hasStaged) Spacer(Modifier.width(8.dp))
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
                    contentDescription = "Staged attachment",
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .size(64.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(palette.elevated),
                )
                IconButton(
                    onClick = { attachments.unstage(uri) },
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(2.dp)
                        .size(32.dp),
                ) {
                    Box(
                        Modifier
                            .size(20.dp)
                            .clip(RoundedCornerShape(50))
                            .background(Color.Black.copy(alpha = 0.6f)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            Icons.Filled.Close,
                            contentDescription = "Remove attachment",
                            tint = Color.White,
                            modifier = Modifier.size(12.dp),
                        )
                    }
                }
            }
        }
    }
}