package com.wsgpolar.disband.ui.chat

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.data.ActiveChat
import com.wsgpolar.disband.data.Database
import com.wsgpolar.disband.data.TetherService
import com.wsgpolar.disband.data.DmMessage
import com.wsgpolar.disband.data.DmThread
import com.wsgpolar.disband.data.Profile
import com.wsgpolar.disband.data.RealtimeService
import com.wsgpolar.disband.state.AppState
import com.wsgpolar.disband.ui.calls.rememberAudioPermissionTrigger
import kotlinx.coroutines.launch

/** The round "start a 1:1 voice call" button shown on DM rows / chats. */
@Composable
fun CallActionButton(app: AppState, peer: Profile) {
    val palette = LocalPalette.current
    val scope = rememberCoroutineScope()
    val trigger = rememberAudioPermissionTrigger { scope.launch { app.calls.startCall(peer) } }
    IconButton(onClick = { trigger() }) {
        Icon(Icons.Filled.Call, contentDescription = "Voice call", tint = palette.accent)
    }
}

@Composable
fun DmChatScreen(app: AppState, thread: DmThread, onBack: () -> Unit) {
    val uid = app.currentUserId ?: return
    val friend = thread.friend
    val dmUnread = app.dmUnread
    val scope = rememberCoroutineScope()

    var rows by remember(thread.id) { mutableStateOf<List<ChatRow>>(emptyList()) }
    val reactions = remember { ReactionState("dm") }
    val ctx = androidx.compose.ui.platform.LocalContext.current
    val attach = remember { AttachmentSender("dm", thread.id) }
    var loading by remember(thread.id) { mutableStateOf(true) }

    LaunchedEffect(thread.id) {
        dmUnread.markActive(thread.id)
        ActiveChat.show(thread.id)
        runCatching { Database.markDmRead(thread.id) }

        val loaded = runCatching { Database.dmMessages(thread.id) }.getOrDefault(emptyList())
        rows = loaded.map { it.toRow(uid) }
        loading = false
        reactions.load(rows.map { it.id }, uid)

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

    androidx.compose.runtime.DisposableEffect(thread.id) {
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
        emptyText = "Say hi!",
        callAction = friend?.let { { CallActionButton(app, it) } },
        onSend = { text ->
            scope.launch {
                val messageId = runCatching {
                    Database.sendDmMessage(thread.id, uid, text)
                }.getOrNull()
                dmUnread.markActive(thread.id)
                // Detached from the send on purpose: whatever Tether does or
                // fails to do, the message has landed and stays landed.
                if (messageId != null) {
                    TetherService.fireAskIfNeeded(
                        messageId = messageId, content = text, surface = "dm",
                        threadId = thread.id, userId = uid,
                        isAero = app.subscriptions.plan.isPaid,
                    )
                }
            }
        },
        attachments = attach,
        onSendAttachments = { caption ->
            scope.launch { attach.send(ctx, uid, caption) }
        },
        onToggleReaction = { messageId, emoji ->
            scope.launch { reactions.toggle(messageId, emoji, uid) }
        },
        onBack = onBack,
    )
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