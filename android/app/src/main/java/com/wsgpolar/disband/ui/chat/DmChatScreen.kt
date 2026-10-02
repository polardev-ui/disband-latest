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

    var rows by remember(thread.id) { mutableStateOf<List<ChatRow>>(emptyList()) }
    // Keyed by thread: switching conversations used to leak the previous
    // thread's reactions, staged images and typing state into the new one.
    val reactions = remember(thread.id) { ReactionState("dm") }
    val ctx = LocalContext.current
    val typing = remember(thread.id) { TypingState("dm", thread.id, scope) }
    val attach = remember(thread.id) { AttachmentSender("dm", thread.id) }
    var loading by remember(thread.id) { mutableStateOf(true) }
    var loadError by remember(thread.id) { mutableStateOf<String?>(null) }
    var sendError by remember(thread.id) { mutableStateOf<String?>(null) }
    var replyTo by remember(thread.id) { mutableStateOf<ChatRow?>(null) }
    var editingRow by remember(thread.id) { mutableStateOf<ChatRow?>(null) }
    var actionRow by remember { mutableStateOf<ChatRow?>(null) }
    var deleteRow by remember { mutableStateOf<ChatRow?>(null) }
    // Composer text lives here when editing so the scaffold's internal field
    // doesn't fight it — the scaffold clears its own box on send.
    var editText by remember { mutableStateOf("") }

    suspend fun load() {
        loading = true
        loadError = null
        try {
            val loaded = Database.dmMessages(thread.id)
            rows = loaded.map { it.toRow(uid) }
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

    LaunchedEffect(thread.id) {
        dmUnread.markActive(thread.id)
        ActiveChat.show(thread.id)
        runCatching { Database.markDmRead(thread.id) }

        load()
        typing.start(uid) { id -> runCatching { Database.profile(id) }.getOrNull() }

        val live = runCatching {
            RealtimeService.observeInserts("dm_messages", "thread_id=eq.${thread.id}", DmMessage.serializer())
        }.getOrNull()
        if (live != null) {
            try {
                live.flow.collect { msg ->
                    if (msg.authorId != uid) {
                        dmUnread.increment(msg.threadId, msg.authorId, uid)
                        // Read state was only advanced when the screen opened,
                        // so anything arriving while you sat reading came back
                        // as unread on the next launch.
                        runCatching { Database.markDmRead(thread.id) }
                    }
                    rows = rows.filterNot { it.id == msg.id } + msg.toRow(uid)
                }
            } finally {
                runCatching { live.channel.unsubscribe() }
            }
        }
    }

    DisposableEffect(thread.id) {
        onDispose {
            dmUnread.clearActive()
            ActiveChat.clear()
        }
    }

    ChatScaffold(
        title = friend?.name ?: "DM",
        subtitle = friend?.let { "@" + it.handle } ?: "",
        avatarUrl = friend?.avatarUrl,
        avatarName = friend?.name ?: "?",
        ownUserId = uid,
        rows = reactions.applyTo(rows),
        loading = loading,
        loadError = loadError,
        onRetryLoad = { scope.launch { load() } },
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
        onSend = { text ->
            sendError = null
            scope.launch {
                // Editing saves over the row; sending creates a new one.
                val target = editingRow
                if (target != null) {
                    val ok = runCatching { Database.editDmMessage(target.id, text) }.isSuccess
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
                    Database.sendDmMessage(thread.id, uid, text, replyToId = replyTo?.id)
                }.getOrNull()
                if (messageId == null) {
                    sendError = "Couldn't send. Check your connection and try again."
                } else {
                    replyTo = null
                    dmUnread.markActive(thread.id)
                    // Detached from the send on purpose: whatever Tether does or
                    // fails to do, the message has landed and stays landed.
                    TetherService.fireAskIfNeeded(
                        messageId = messageId, content = text, surface = "dm",
                        threadId = thread.id, userId = uid,
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
            onEdit = { editingRow = row; editText = row.content },
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
                        runCatching { Database.deleteDmMessage(id) }
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
