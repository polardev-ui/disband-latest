package com.wsgpolar.disband.ui.chat

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp
import com.wsgpolar.disband.core.Brand
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.data.ActiveChat
import com.wsgpolar.disband.data.Database
import com.wsgpolar.disband.data.Profile
import com.wsgpolar.disband.data.TetherService
import com.wsgpolar.disband.data.DmMessage
import com.wsgpolar.disband.data.DmThread
import com.wsgpolar.disband.data.RealtimeService
import com.wsgpolar.disband.state.AppState
import com.wsgpolar.disband.ui.calls.rememberAudioPermissionTrigger
import kotlinx.coroutines.launch
import kotlinx.coroutines.awaitCancellation
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.repeatOnLifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner

/** The round green "start a 1:1 voice call" button, mirroring iOS. */
@Composable
fun CallActionButton(app: AppState, peer: Profile, enabled: Boolean = true) {
    val scope = rememberCoroutineScope()
    val trigger = rememberAudioPermissionTrigger { scope.launch { app.calls.startCall(peer) } }
    Box(
        Modifier
            .size(48.dp)
            .clip(CircleShape)
            .background(if (enabled) Brand.online else Brand.online.copy(alpha = 0.4f))
            .clickable(
                enabled = enabled,
                role = Role.Button,
                onClickLabel = "Voice call ${peer.name}",
                onClick = { trigger() },
            ),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            Icons.Filled.Call,
            contentDescription = null,
            tint = Color.White,
            modifier = Modifier.size(20.dp),
        )
    }
}

@Composable
fun DmChatScreen(app: AppState, thread: DmThread, onBack: () -> Unit) {
    val uid = app.currentUserId ?: return
    val friend = thread.friend
    val dmUnread = app.dmUnread
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current

    val timeline = rememberChatTimeline(
        key = "dm:${thread.id}", table = "dm_messages", filter = "thread_id=eq.${thread.id}",
        serializer = DmMessage.serializer(), toRow = { it.toRow(uid) },
        fetch = { before -> Database.dmMessages(thread.id, before = before).map { it.toRow(uid) } },
        onIncoming = { row -> if (row.authorId != uid) runCatching { Database.markDmRead(thread.id) } },
    )
    val rows = timeline.rows

    // Keyed by thread: switching conversations used to leak the previous
    // thread's reactions, staged images and typing state into the new one.
    val reactions = remember(thread.id) { ReactionState("dm") }
    val ctx = LocalContext.current
    val typing = remember(thread.id) { TypingState("dm", thread.id, scope) }
    val attach = remember(thread.id) { AttachmentSender("dm", thread.id) }
    var sendError by remember(thread.id) { mutableStateOf<String?>(null) }
    var replyTo by remember(thread.id) { mutableStateOf<ChatRow?>(null) }
    var editingRow by remember(thread.id) { mutableStateOf<ChatRow?>(null) }
    var actionRow by remember(thread.id) { mutableStateOf<ChatRow?>(null) }
    var deleteRow by remember(thread.id) { mutableStateOf<ChatRow?>(null) }

    LaunchedEffect(rows.map { it.id }) { reactions.load(rows.map { it.id }, uid) }

    fun openAttachment(url: String) {
        runCatching {
            context.startActivity(Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url)))
        }
    }

    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(thread.id, lifecycle) {
        lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            try {
                dmUnread.markActive(thread.id)
                app.closedDms.unhide(thread.friend?.id)
                launch { runCatching { Database.markDmRead(thread.id) } }
                ActiveChat.show(thread.id)
                typing.start(uid) { id -> runCatching { Database.profile(id) }.getOrNull() }
                awaitCancellation()
            } finally {
                typing.stop()
                if (dmUnread.activeThreadId == thread.id) dmUnread.clearActive()
                if (ActiveChat.isShowing(thread.id)) ActiveChat.clear()
            }
        }
    }

    ChatScaffold(
        title = friend?.name ?: "DM",
        subtitle = friend?.let { "@" + it.handle } ?: "",
        avatarUrl = friend?.avatarUrl,
        avatarName = friend?.name ?: "?",
        ownUserId = uid,
        rows = reactions.applyTo(rows),
        loading = timeline.loading,
        loadError = timeline.error,
        onRetryLoad = { scope.launch { timeline.refresh() } },
        hasOlder = timeline.hasOlder,
        loadingOlder = timeline.loadingOlder,
        onLoadOlder = { scope.launch { timeline.older() } },
        conversationKey = "dm:${thread.id}",
        emptyText = "Say hi!",
        sendHint = sendError,
        sendPlaceholder = when {
            editingRow != null -> "Edit message"
            friend != null -> "Message ${friend.name}"
            else -> "Message"
        },
        replyTo = replyTo,
        onReplyDismiss = { replyTo = null },
        editingRow = editingRow,
        onEditDismiss = { editingRow = null },
        callAction = friend?.let { { CallActionButton(app, it) } },
        onSend = send@{ text ->
            sendError = null
            val target = editingRow
            if (target != null) {
                try {
                    Database.editDmMessage(target.id, text)
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
            val messageId = try { Database.sendDmMessage(thread.id, uid, text, replyToId = replyId) }
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
                    messageId = messageId, content = text, surface = "dm",
                    threadId = thread.id, userId = uid, isAero = app.subscriptions.plan.isPaid,
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
                            Database.deleteDmMessage(id)
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

private fun DmMessage.toRow(me: String? = null): ChatRow = ChatRow(
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
