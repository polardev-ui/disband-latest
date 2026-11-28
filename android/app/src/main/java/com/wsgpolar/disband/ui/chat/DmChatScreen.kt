package com.wsgpolar.disband.ui.chat

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.fillMaxWidth
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
fun DmChatScreen(app: AppState, thread: DmThread, onBack: () -> Unit, onRequestChanged: () -> Unit = {}) {
    val uid = app.currentUserId ?: return
    val friend = thread.friend
    val dmUnread = app.dmUnread
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current

    val typing = remember(thread.id) { TypingState("dm", thread.id, scope) }
    val timeline = rememberChatTimeline(
        key = "dm:${thread.id}", table = "dm_messages", filter = "thread_id=eq.${thread.id}",
        serializer = DmMessage.serializer(), toRow = { it.toRow(uid) },
        fetch = { before -> Database.dmMessages(thread.id, before = before).map { it.toRow(uid) } },
        onIncoming = { row -> row.authorId?.let { typing.clear(it) }; if (row.authorId != uid) runCatching { Database.markDmRead(thread.id) } },
    )
    val rows = timeline.rows
    // No space here: no space roles (bug 1984bf74 / ad0498d5). Role pings
    // coloured from the last space visited must not carry into a DM.
    LaunchedEffect(thread.id) { ChatMarkdown.setRoles(emptyList()) }

    // Keyed by thread: switching conversations used to leak the previous
    // thread's reactions, staged images and typing state into the new one.
    val reactions = remember(thread.id) { ReactionState("dm") }
    val ctx = LocalContext.current
    val attach = remember(thread.id) { AttachmentSender("dm", thread.id) }
    attach.maxUploadBytes = app.subscriptions.entitlements.maxUploadBytes
    var sendError by remember(thread.id) { mutableStateOf<String?>(null) }
    // Message request (migration 0193). `requestAnswered` flips once the user
    // accepts or replies, so the bar goes away without waiting for a reload.
    var requestAnswered by remember(thread.id) { mutableStateOf(false) }
    val incomingRequest = thread.isIncomingRequest(uid) && !requestAnswered
    val outgoingRequest = thread.isOutgoingRequest(uid)
    var replyTo by remember(thread.id) { mutableStateOf<ChatRow?>(null) }
    var editingRow by remember(thread.id) { mutableStateOf<ChatRow?>(null) }
    var actionRow by remember(thread.id) { mutableStateOf<ChatRow?>(null) }
    var deleteRow by remember(thread.id) { mutableStateOf<ChatRow?>(null) }

    LaunchedEffect(rows.map { it.id }) { reactions.load(rows.map { it.id }, uid) }
    LaunchedEffect(thread.id) { val latest = { timeline.rows.map { it.id } }; reactions.watch(latest, uid) }

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
        chatContext = com.wsgpolar.disband.data.ChatContext(com.wsgpolar.disband.data.ChatKind.Dm, thread.id),
        mentionSource = MentionSource.Local(listOfNotNull(friend)),
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
        commandBar = if (incomingRequest || outgoingRequest) { _, _ ->
            MessageRequestBar(
                peer = friend, threadId = thread.id, incoming = incomingRequest,
                onAccepted = { requestAnswered = true; onRequestChanged() },
                onLeave = { onRequestChanged(); onBack() },
            )
        } else null,
        onSend = send@{ text ->
            sendError = null
            // Say why up front rather than letting the server refuse it as a
            // vague "Couldn't send". The draft stays in the composer.
            val maxChars = app.subscriptions.entitlements.maxMessageChars
            if (text.length > maxChars) {
                sendError = "Messages can be up to $maxChars characters on your plan (this one is ${text.length})."
                return@send false
            }
            val target = editingRow
            if (target != null) {
                try {
                    Database.editDmMessage(target.id, text)
                    timeline.upsert((timeline.rows.firstOrNull { it.id == target.id } ?: target).copy(content = text, editedAt = java.time.Instant.now().toString()))
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
            val sent = try { Database.sendDmMessage(thread.id, uid, text, replyToId = replyId) }
                catch (e: kotlinx.coroutines.CancellationException) { throw e }
                catch (_: Exception) { null }
            if (sent == null) {
                sendError = "Couldn't send. Your draft is saved — try again."
                false
            } else {
                val messageId = sent.id
                // Replying accepts a request; the database does the same on insert.
                if (incomingRequest) { requestAnswered = true; onRequestChanged() }
                // A successful HTTP response is enough to show our message. The
                // socket may be late or reconnecting; its echo shares this id.
                if (timeline.rows.none { it.id == messageId }) timeline.upsert(ChatRow(
                    id = messageId, author = app.profile.value, authorId = uid,
                    content = text, attachmentType = null, createdAt = sent.createdAt ?: sentAt, replyToId = replyId,
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

    var forwardRow by remember { mutableStateOf<ChatRow?>(null) }
    forwardRow?.let { row ->
        ForwardSheet(uid = uid, row = row, onDismiss = { forwardRow = null }, onForwarded = { message ->
            android.widget.Toast.makeText(ctx, message, android.widget.Toast.LENGTH_SHORT).show()
        })
    }

    actionRow?.let { row ->
        val isOwn = row.authorId == uid || row.author?.id == uid
        MessageActionSheet(
            chatContext = com.wsgpolar.disband.data.ChatContext(com.wsgpolar.disband.data.ChatKind.Dm, thread.id),
            row = row,
            isOwn = isOwn,
            onDismiss = { actionRow = null },
            onCopy = { clipboard.setText(AnnotatedString(row.content)) },
            onReply = { replyTo = row },
            onEdit = { editingRow = row },
            onDelete = { deleteRow = row },
            onReact = { emoji -> scope.launch { reactions.toggle(row.id, emoji, uid) } },
            onForward = { forwardRow = row },
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

/**
 * Sits above the composer while a DM is still a message request (iOS
 * MessageRequestBar). The recipient can Accept, Ignore or Block; the sender
 * just sees a note that their messages arrive as a request.
 */
@Composable
private fun MessageRequestBar(
    peer: Profile?,
    threadId: String,
    incoming: Boolean,
    onAccepted: () -> Unit,
    onLeave: () -> Unit,
) {
    val palette = LocalPalette.current
    val scope = rememberCoroutineScope()
    var busy by remember(threadId) { mutableStateOf(false) }
    var error by remember(threadId) { mutableStateOf<String?>(null) }
    val name = peer?.name ?: "They"

    if (!incoming) {
        androidx.compose.material3.Text(
            "You're not friends with $name, so your messages arrive as a message request until they reply or accept.",
            color = palette.textMuted, fontSize = 13.sp,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        )
        return
    }

    fun run(action: suspend () -> Unit, leaveAfter: Boolean) {
        if (busy) return
        busy = true
        error = null
        scope.launch {
            try {
                action()
                if (leaveAfter) onLeave() else onAccepted()
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                error = e.message?.takeIf { it.isNotBlank() } ?: "Something went wrong. Try again."
            } finally {
                busy = false
            }
        }
    }

    androidx.compose.foundation.layout.Column(
        Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp)
            .clip(RoundedCornerShape(16.dp)).background(palette.surface).padding(14.dp),
        verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(8.dp),
    ) {
        Text("$name wants to message you", color = palette.textPrimary, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
        Text(
            "You're not friends, but you share a space. They won't know you've seen this unless you reply. Replying or accepting moves it to your messages.",
            color = palette.textMuted, fontSize = 13.sp,
        )
        error?.let { Text(it, color = Brand.dnd, fontSize = 13.sp) }
        androidx.compose.foundation.layout.Row(horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(8.dp)) {
            androidx.compose.material3.Button(
                enabled = !busy,
                onClick = { run({ Database.respondMessageRequest(threadId, accept = true) }, leaveAfter = false) },
                colors = androidx.compose.material3.ButtonDefaults.buttonColors(containerColor = palette.accent, contentColor = Color.White),
            ) { Text("Accept") }
            androidx.compose.material3.OutlinedButton(
                enabled = !busy,
                onClick = { run({ Database.respondMessageRequest(threadId, accept = false) }, leaveAfter = true) },
            ) { Text("Ignore", color = palette.textPrimary) }
            androidx.compose.material3.OutlinedButton(
                enabled = !busy && peer != null,
                onClick = { peer?.let { run({ Database.blockUser(it.id) }, leaveAfter = true) } },
            ) { Text("Block", color = Brand.dnd) }
        }
    }
}
