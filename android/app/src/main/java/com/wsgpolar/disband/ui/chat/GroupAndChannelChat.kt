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
import kotlinx.coroutines.awaitCancellation
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.repeatOnLifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner

@Composable
fun GroupChatScreen(app: AppState, group: GroupChat, onBack: () -> Unit) {
    val uid = app.currentUserId ?: return
    val dmUnread = app.dmUnread
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current

    val timeline = rememberChatTimeline(
        key = "group:${group.id}", table = "group_messages", filter = "group_id=eq.${group.id}",
        serializer = GroupMessage.serializer(), toRow = { it.toRow(uid) },
        fetch = { before -> Database.groupMessages(group.id, before = before).map { it.toRow(uid) } },
        onIncoming = { row -> if (row.authorId != uid) runCatching { Database.markGroupRead(group.id) } },
    )
    val rows = timeline.rows

    var sendError by remember(group.id) { mutableStateOf<String?>(null) }
    var replyTo by remember(group.id) { mutableStateOf<ChatRow?>(null) }
    var editingRow by remember(group.id) { mutableStateOf<ChatRow?>(null) }
    var actionRow by remember(group.id) { mutableStateOf<ChatRow?>(null) }
    var deleteRow by remember(group.id) { mutableStateOf<ChatRow?>(null) }
    val reactions = remember(group.id) { ReactionState("group") }
    val ctx = LocalContext.current
    val typing = remember(group.id) { TypingState("group", group.id, scope) }
    val attach = remember(group.id) { AttachmentSender("group", group.id) }

    LaunchedEffect(rows.map { it.id }) { reactions.load(rows.map { it.id }, uid) }

    fun openAttachment(url: String) {
        runCatching {
            context.startActivity(Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url)))
        }
    }

    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(group.id, lifecycle) {
        lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            try {
                dmUnread.markGroupActive(group.id)
                launch { runCatching { Database.markGroupRead(group.id) } }
                ActiveChat.show(group.id)
                typing.start(uid) { id -> runCatching { Database.profile(id) }.getOrNull() }
                awaitCancellation()
            } finally {
                typing.stop()
                if (dmUnread.activeGroupId == group.id) dmUnread.clearGroupActive()
                if (ActiveChat.isShowing(group.id)) ActiveChat.clear()
            }
        }
    }

    ChatScaffold(
        title = group.name,
        subtitle = if (group.members.isNullOrEmpty()) "Group chat" else "${group.members!!.size} members",
        avatarUrl = group.iconUrl,
        avatarName = group.name,
        ownUserId = uid,
        rows = reactions.applyTo(rows),
        loading = timeline.loading,
        loadError = timeline.error,
        onRetryLoad = { scope.launch { timeline.refresh() } },
        hasOlder = timeline.hasOlder,
        loadingOlder = timeline.loadingOlder,
        onLoadOlder = { scope.launch { timeline.older() } },
        conversationKey = "group:${group.id}",
        emptyText = "No messages yet",
        sendHint = sendError,
        sendPlaceholder = if (editingRow != null) "Edit message" else "Message ${group.name}",
        replyTo = replyTo,
        onReplyDismiss = { replyTo = null },
        editingRow = editingRow,
        onEditDismiss = { editingRow = null },
        onSend = send@{ text ->
            sendError = null
            val target = editingRow
            if (target != null) {
                try {
                    Database.editGroupMessage(target.id, text)
                    timeline.upsert(target.copy(content = text, editedAt = java.time.Instant.now().toString()))
                    editingRow = null
                    return@send true
                } catch (e: kotlinx.coroutines.CancellationException) { throw e }
                catch (_: Exception) {
                    sendError = "Couldn't save your edit. Your text is still here."
                    return@send false
                }
            }
            val replyId = replyTo?.id
            val sentAt = java.time.Instant.now().toString()
            val messageId = try { Database.sendGroupMessage(group.id, uid, text, replyToId = replyId) }
                catch (e: kotlinx.coroutines.CancellationException) { throw e }
                catch (_: Exception) { null }
            if (messageId == null) {
                sendError = "Couldn't send. Your draft is saved — try again."
                false
            } else {
                // A successful HTTP response is enough to show our message. The
                // socket may be late or reconnecting; its echo shares this id.
                if (timeline.rows.none { it.id == messageId }) timeline.upsert(ChatRow(
                    id = messageId, author = app.profile.value, authorId = uid,
                    content = text, attachmentType = null, createdAt = sentAt, replyToId = replyId,
                ))
                replyTo = null
                scope.launch { TetherService.fireAskIfNeeded(
                    messageId = messageId, content = text, surface = "group",
                    threadId = null, userId = uid, isAero = app.subscriptions.plan.isPaid,
                ) }
                true
            }
        },
        typingUsers = typing.typers,
        onTyping = { typing.noteTyping(uid, app.profile.value?.name ?: "Someone") },
        attachments = attach,
        onSendAttachments = { caption ->
            val sent = attach.send(ctx, uid, caption, replyToId = replyTo?.id)
            if (sent) {
                attach.sentRow?.let { row ->
                    if (timeline.rows.none { it.id == row.id }) timeline.upsert(row.copy(author = app.profile.value))
                }
                replyTo = null
            }
            sent
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
                        try {
                            Database.deleteGroupMessage(id)
                            timeline.remove(id)
                        } catch (e: kotlinx.coroutines.CancellationException) { throw e }
                        catch (_: Exception) { sendError = "Couldn't delete that message. Try again." }
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

    val timeline = rememberChatTimeline(
        key = "channel:${channel.id}", table = "messages", filter = "channel_id=eq.${channel.id}",
        serializer = Message.serializer(), toRow = { it.toRow(uid) },
        fetch = { before -> Database.messages(channel.id, before = before).map { it.toRow(uid) } },
    )
    val rows = timeline.rows

    // Keyed by channel: the old unkeyed remember leaked one channel's
    // reactions into the next channel opened.
    val reactions = remember(channel.id) { ReactionState("channel") }
    val ctx = LocalContext.current
    // "ch" matches iOS `typing:ch:{id}` — "channel" would be a topic nobody
    // else listens on, silently dropping typing indicators cross-platform.
    val typing = remember(channel.id) { TypingState("ch", channel.id, scope) }
    val attach = remember(channel.id) { AttachmentSender("channel", channel.id) }
    var sendError by remember(channel.id) { mutableStateOf<String?>(null) }
    var replyTo by remember(channel.id) { mutableStateOf<ChatRow?>(null) }
    var editingRow by remember(channel.id) { mutableStateOf<ChatRow?>(null) }
    var actionRow by remember(channel.id) { mutableStateOf<ChatRow?>(null) }
    var deleteRow by remember(channel.id) { mutableStateOf<ChatRow?>(null) }

    LaunchedEffect(rows.map { it.id }) { reactions.load(rows.map { it.id }, uid) }

    fun openAttachment(url: String) {
        runCatching {
            context.startActivity(Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url)))
        }
    }

    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(channel.id, lifecycle) {
        lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            try {
                ActiveChat.show(channel.id)
                typing.start(uid) { id -> runCatching { Database.profile(id) }.getOrNull() }
                awaitCancellation()
            } finally {
                typing.stop()
                if (ActiveChat.isShowing(channel.id)) ActiveChat.clear()
            }
        }
    }

    val readOnly = channel.readOnly == true
    ChatScaffold(
        title = "#" + channel.name,
        subtitle = serverName,
        avatarUrl = null,
        avatarName = "#" + channel.name,
        ownUserId = uid,
        rows = reactions.applyTo(rows),
        loading = timeline.loading,
        loadError = timeline.error,
        onRetryLoad = { scope.launch { timeline.refresh() } },
        hasOlder = timeline.hasOlder,
        loadingOlder = timeline.loadingOlder,
        onLoadOlder = { scope.launch { timeline.older() } },
        conversationKey = "channel:${channel.id}",
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
        onSend = send@{ text ->
            sendError = null
            val target = editingRow
            if (target != null) {
                try {
                    Database.editChannelMessage(target.id, text)
                    timeline.upsert(target.copy(content = text, editedAt = java.time.Instant.now().toString()))
                    editingRow = null
                    return@send true
                } catch (e: kotlinx.coroutines.CancellationException) { throw e }
                catch (_: Exception) {
                    sendError = "Couldn't save your edit. Your text is still here."
                    return@send false
                }
            }
            val replyId = replyTo?.id
            val sentAt = java.time.Instant.now().toString()
            val messageId = try { Database.sendMessage(channel.id, uid, text, replyToId = replyId) }
                catch (e: kotlinx.coroutines.CancellationException) { throw e }
                catch (_: Exception) { null }
            if (messageId == null) {
                sendError = "Couldn't send. Your draft is saved — try again."
                false
            } else {
                // A successful HTTP response is enough to show our message. The
                // socket may be late or reconnecting; its echo shares this id.
                if (timeline.rows.none { it.id == messageId }) timeline.upsert(ChatRow(
                    id = messageId, author = app.profile.value, authorId = uid,
                    content = text, attachmentType = null, createdAt = sentAt, replyToId = replyId,
                ))
                replyTo = null
                scope.launch { TetherService.fireAskIfNeeded(
                    messageId = messageId, content = text, surface = "channel",
                    threadId = null, userId = uid, isAero = app.subscriptions.plan.isPaid,
                ) }
                true
            }
        },
        typingUsers = typing.typers,
        onTyping = { typing.noteTyping(uid, app.profile.value?.name ?: "Someone") },
        attachments = attach,
        onSendAttachments = { caption ->
            val sent = attach.send(ctx, uid, caption, replyToId = replyTo?.id)
            if (sent) {
                attach.sentRow?.let { row ->
                    if (timeline.rows.none { it.id == row.id }) timeline.upsert(row.copy(author = app.profile.value))
                }
                replyTo = null
            }
            sent
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
                        try {
                            Database.deleteChannelMessage(id)
                            timeline.remove(id)
                        } catch (e: kotlinx.coroutines.CancellationException) { throw e }
                        catch (_: Exception) { sendError = "Couldn't delete that message. Try again." }
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
