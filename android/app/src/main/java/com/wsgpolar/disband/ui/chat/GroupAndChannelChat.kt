package com.wsgpolar.disband.ui.chat

import android.content.Intent
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import com.wsgpolar.disband.core.Brand
import com.wsgpolar.disband.data.ActiveChat
import com.wsgpolar.disband.data.Channel
import com.wsgpolar.disband.data.Database
import com.wsgpolar.disband.data.Profile
import com.wsgpolar.disband.data.TetherService
import com.wsgpolar.disband.data.GroupChat
import com.wsgpolar.disband.data.GroupMessage
import com.wsgpolar.disband.data.Message
import com.wsgpolar.disband.data.RealtimeService
import com.wsgpolar.disband.state.AppState
import kotlinx.coroutines.launch

@Composable
fun GroupChatScreen(app: AppState, group: GroupChat, onBack: () -> Unit) {
    val uid = app.currentUserId ?: return
    val dmUnread = app.dmUnread
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current

    var rows by remember(group.id) { mutableStateOf<List<ChatRow>>(emptyList()) }
    var loading by remember(group.id) { mutableStateOf(true) }
    var loadError by remember(group.id) { mutableStateOf<String?>(null) }
    var sendError by remember(group.id) { mutableStateOf<String?>(null) }
    var replyTo by remember(group.id) { mutableStateOf<ChatRow?>(null) }
    var editingRow by remember(group.id) { mutableStateOf<ChatRow?>(null) }
    var actionRow by remember { mutableStateOf<ChatRow?>(null) }
    var deleteRow by remember { mutableStateOf<ChatRow?>(null) }
    val reactions = remember(group.id) { ReactionState("group") }
    val ctx = LocalContext.current
    val typing = remember(group.id) { TypingState("group", group.id, scope) }
    val attach = remember(group.id) { AttachmentSender("group", group.id) }

    suspend fun load() {
        loading = true
        loadError = null
        try {
            rows = Database.groupMessages(group.id).map { it.toRow(uid) }
        } catch (e: Exception) {
            loadError = e.message ?: e.toString()
        }
        loading = false
        reactions.load(rows.map { it.id }, uid)
    }

    fun openAttachment(url: String) {
        runCatching {
            context.startActivity(Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url)))
        }
    }

    LaunchedEffect(group.id) {
        dmUnread.markGroupActive(group.id)
        ActiveChat.show(group.id)
        runCatching { Database.markGroupRead(group.id) }

        load()
        typing.start(uid) { id -> runCatching { Database.profile(id) }.getOrNull() }

        val live = runCatching {
            RealtimeService.observeInserts("group_messages", "group_id=eq.${group.id}", GroupMessage.serializer())
        }.getOrNull()
        if (live != null) {
            try {
                live.flow.collect { msg ->
                    if (msg.authorId != uid) {
                        dmUnread.incrementGroup(msg.groupId, msg.authorId, uid)
                        runCatching { Database.markGroupRead(group.id) }
                    }
                    rows = rows.filterNot { it.id == msg.id } + msg.toRow(uid)
                }
            } finally {
                runCatching { live.channel.unsubscribe() }
            }
        }
    }

    DisposableEffect(group.id) {
        onDispose {
            dmUnread.clearGroupActive()
            ActiveChat.clear()
        }
    }

    ChatScaffold(
        title = group.name,
        subtitle = if (group.members.isNullOrEmpty()) "Group chat" else "${group.members!!.size} members",
        avatarUrl = group.iconUrl,
        avatarName = group.name,
        ownUserId = uid,
        rows = reactions.applyTo(rows),
        loading = loading,
        loadError = loadError,
        onRetryLoad = { scope.launch { load() } },
        emptyText = "No messages yet",
        sendHint = sendError,
        sendPlaceholder = if (editingRow != null) "Edit message" else "Message ${group.name}",
        replyTo = replyTo,
        onReplyDismiss = { replyTo = null },
        editingRow = editingRow,
        onEditDismiss = { editingRow = null },
        onSend = { text ->
            sendError = null
            scope.launch {
                val target = editingRow
                if (target != null) {
                    val ok = runCatching { Database.editGroupMessage(target.id, text) }.isSuccess
                    if (ok) {
                        rows = rows.map {
                            if (it.id == target.id) it.copy(content = text, editedAt = "now") else it
                        }
                        editingRow = null
                    } else {
                        sendError = "Couldn't save your edit. Try again."
                    }
                    return@launch
                }
                val messageId = runCatching {
                    Database.sendGroupMessage(group.id, uid, text, replyToId = replyTo?.id)
                }.getOrNull()
                if (messageId == null) {
                    sendError = "Couldn't send. Check your connection and try again."
                } else {
                    replyTo = null
                    TetherService.fireAskIfNeeded(
                        messageId = messageId, content = text, surface = "group",
                        threadId = null, userId = uid,
                        isAero = app.subscriptions.plan.isPaid,
                    )
                }
                dmUnread.markGroupActive(group.id)
            }
        },
        typingUsers = typing.typers,
        onTyping = { typing.noteTyping(uid, app.profile.value?.name ?: "Someone") },
        attachments = attach,
        onSendAttachments = { caption ->
            scope.launch { attach.send(ctx, uid, caption) }
        },
        onToggleReaction = { messageId, emoji ->
            scope.launch { reactions.toggle(messageId, emoji, uid) }
        },
        onOpenAttachment = { openAttachment(it.url) },
        onMessageLongPress = { actionRow = it },
        onBack = onBack,
    )

    actionRow?.let { row ->
        val isOwn = row.authorId == uid || row.author?.id == uid
        MessageActionSheet(
            row = row,
            isOwn = isOwn,
            onDismiss = { actionRow = null },
            onCopy = { clipboard.setText(AnnotatedString(row.content)) },
            onReply = { replyTo = row },
            onEdit = { editingRow = row },
            onDelete = { deleteRow = row },
            onReact = { emoji -> scope.launch { reactions.toggle(row.id, emoji, uid) } },
        )
    }
    deleteRow?.let { row ->
        AlertDialog(
            onDismissRequest = { deleteRow = null },
            title = { Text("Delete message?") },
            text = { Text("This can't be undone.") },
            confirmButton = {
                TextButton(onClick = {
                    val id = row.id
                    deleteRow = null
                    actionRow = null
                    scope.launch {
                        runCatching { Database.deleteGroupMessage(id) }
                        rows = rows.filterNot { it.id == id }
                    }
                }) { Text("Delete", color = Brand.dnd) }
            },
            dismissButton = {
                TextButton(onClick = { deleteRow = null }) { Text("Cancel") }
            },
        )
    }
}

@Composable
fun ChannelChatScreen(app: AppState, channel: Channel, serverName: String, onBack: () -> Unit) {
    val uid = app.currentUserId ?: return
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current

    var rows by remember(channel.id) { mutableStateOf<List<ChatRow>>(emptyList()) }
    // Keyed by channel: the old unkeyed remember leaked one channel's
    // reactions into the next channel opened.
    val reactions = remember(channel.id) { ReactionState("channel") }
    val ctx = LocalContext.current
    // "ch" matches iOS `typing:ch:{id}` — "channel" would be a topic nobody
    // else listens on, silently dropping typing indicators cross-platform.
    val typing = remember(channel.id) { TypingState("ch", channel.id, scope) }
    val attach = remember(channel.id) { AttachmentSender("channel", channel.id) }
    var loading by remember(channel.id) { mutableStateOf(true) }
    var loadError by remember(channel.id) { mutableStateOf<String?>(null) }
    var sendError by remember(channel.id) { mutableStateOf<String?>(null) }
    var replyTo by remember(channel.id) { mutableStateOf<ChatRow?>(null) }
    var editingRow by remember(channel.id) { mutableStateOf<ChatRow?>(null) }
    var actionRow by remember { mutableStateOf<ChatRow?>(null) }
    var deleteRow by remember { mutableStateOf<ChatRow?>(null) }

    suspend fun load() {
        loading = true
        loadError = null
        try {
            rows = Database.messages(channel.id).map { it.toRow(uid) }
        } catch (e: Exception) {
            loadError = e.message ?: e.toString()
        }
        loading = false
        reactions.load(rows.map { it.id }, uid)
    }

    fun openAttachment(url: String) {
        runCatching {
            context.startActivity(Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url)))
        }
    }

    LaunchedEffect(channel.id) {
        ActiveChat.show(channel.id)
        load()
        typing.start(uid) { id -> runCatching { Database.profile(id) }.getOrNull() }

        val live = runCatching {
            RealtimeService.observeInserts("messages", "channel_id=eq.${channel.id}", Message.serializer())
        }.getOrNull()
        if (live != null) {
            try {
                live.flow.collect { msg ->
                    rows = rows.filterNot { it.id == msg.id } + msg.toRow(uid)
                }
            } finally {
                runCatching { live.channel.unsubscribe() }
            }
        }
    }

    DisposableEffect(channel.id) {
        onDispose { ActiveChat.clear() }
    }

    val readOnly = channel.readOnly == true
    ChatScaffold(
        title = "#" + channel.name,
        subtitle = serverName,
        avatarUrl = null,
        avatarName = "#" + channel.name,
        ownUserId = uid,
        rows = reactions.applyTo(rows),
        loading = loading,
        loadError = loadError,
        onRetryLoad = { scope.launch { load() } },
        emptyText = "No messages yet",
        sendEnabled = !readOnly,
        sendPlaceholder = when {
            editingRow != null -> "Edit message"
            readOnly -> "Read-only channel"
            else -> "Message #${channel.name}"
        },
        sendHint = sendError ?: if (readOnly) "Only moderators can post in this channel." else null,
        replyTo = replyTo,
        onReplyDismiss = { replyTo = null },
        editingRow = editingRow,
        onEditDismiss = { editingRow = null },
        onSend = { text ->
            sendError = null
            scope.launch {
                val target = editingRow
                if (target != null) {
                    val ok = runCatching { Database.editChannelMessage(target.id, text) }.isSuccess
                    if (ok) {
                        rows = rows.map {
                            if (it.id == target.id) it.copy(content = text, editedAt = "now") else it
                        }
                        editingRow = null
                    } else {
                        sendError = "Couldn't save your edit. Try again."
                    }
                    return@launch
                }
                val messageId = runCatching {
                    Database.sendMessage(channel.id, uid, text, replyToId = replyTo?.id)
                }.getOrNull()
                if (messageId == null) {
                    sendError = "Couldn't send. Check your connection and try again."
                } else {
                    replyTo = null
                    TetherService.fireAskIfNeeded(
                        messageId = messageId, content = text, surface = "channel",
                        threadId = null, userId = uid,
                        isAero = app.subscriptions.plan.isPaid,
                    )
                }
            }
        },
        typingUsers = typing.typers,
        onTyping = { typing.noteTyping(uid, app.profile.value?.name ?: "Someone") },
        attachments = attach,
        onSendAttachments = { caption ->
            scope.launch { attach.send(ctx, uid, caption) }
        },
        onToggleReaction = { messageId, emoji ->
            scope.launch { reactions.toggle(messageId, emoji, uid) }
        },
        onOpenAttachment = { openAttachment(it.url) },
        onMessageLongPress = { actionRow = it },
        onBack = onBack,
    )

    actionRow?.let { row ->
        val isOwn = row.authorId == uid || row.author?.id == uid
        MessageActionSheet(
            row = row,
            isOwn = isOwn,
            onDismiss = { actionRow = null },
            onCopy = { clipboard.setText(AnnotatedString(row.content)) },
            onReply = { replyTo = row },
            onEdit = { editingRow = row },
            onDelete = { deleteRow = row },
            onReact = { emoji -> scope.launch { reactions.toggle(row.id, emoji, uid) } },
        )
    }
    deleteRow?.let { row ->
        AlertDialog(
            onDismissRequest = { deleteRow = null },
            title = { Text("Delete message?") },
            text = { Text("This can't be undone.") },
            confirmButton = {
                TextButton(onClick = {
                    val id = row.id
                    deleteRow = null
                    actionRow = null
                    scope.launch {
                        runCatching { Database.deleteChannelMessage(id) }
                        rows = rows.filterNot { it.id == id }
                    }
                }) { Text("Delete", color = Brand.dnd) }
            },
            dismissButton = {
                TextButton(onClick = { deleteRow = null }) { Text("Cancel") }
            },
        )
    }
}

private fun Message.toRow(me: String? = null): ChatRow = ChatRow(
    id = id,
    author = author,
    authorId = authorId,
    content = content,
    attachmentType = attachmentType,
    attachmentName = attachmentName,
    attachmentSize = attachmentSize,
    // The url was never carried across, so the renderer only ever had a type
    // to go on — which is why an image showed as the word "Photo".
    attachmentUrl = attachmentUrl,
    attachments = attachments,
    replyToId = replyToId,
    editedAt = editedAt,
    pingsYou = me != null && authorId != me && (
    mentions?.contains(me) == true
    ),
    createdAt = createdAt,
)

private fun GroupMessage.toRow(me: String? = null): ChatRow = ChatRow(
    id = id,
    author = author,
    authorId = authorId,
    content = content,
    attachmentType = attachmentType,
    attachmentName = attachmentName,
    attachmentSize = attachmentSize,
    // The url was never carried across, so the renderer only ever had a type
    // to go on — which is why an image showed as the word "Photo".
    attachmentUrl = attachmentUrl,
    attachments = attachments,
    replyToId = replyToId,
    editedAt = editedAt,
    pingsYou = me != null && authorId != me && (
    false
    ),
    createdAt = createdAt,
)
