package com.wsgpolar.disband.ui.chat

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import com.wsgpolar.disband.data.ActiveChat
import com.wsgpolar.disband.data.Channel
import com.wsgpolar.disband.data.Database
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

    var rows by remember(group.id) { mutableStateOf<List<ChatRow>>(emptyList()) }
    var loading by remember(group.id) { mutableStateOf(true) }
    val reactions = remember(group.id) { ReactionState("group") }

    LaunchedEffect(group.id) {
        dmUnread.markGroupActive(group.id)
        ActiveChat.show(group.id)
        runCatching { Database.markGroupRead(group.id) }

        val loaded = runCatching { Database.groupMessages(group.id) }.getOrDefault(emptyList())
        rows = loaded.map { it.toRow(uid) }
        loading = false
        reactions.load(rows.map { it.id }, uid)

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
        emptyText = "No messages yet",
        onSend = { text ->
            scope.launch {
                runCatching { Database.sendGroupMessage(group.id, uid, text) }
                dmUnread.markGroupActive(group.id)
            }
        },
        onToggleReaction = { messageId, emoji ->
            scope.launch { reactions.toggle(messageId, emoji, uid) }
        },
        onBack = onBack,
    )
}

@Composable
fun ChannelChatScreen(app: AppState, channel: Channel, serverName: String, onBack: () -> Unit) {
    val uid = app.currentUserId ?: return
    val scope = rememberCoroutineScope()

    var rows by remember(channel.id) { mutableStateOf<List<ChatRow>>(emptyList()) }
    val reactions = remember { ReactionState("channel") }
    var loading by remember(channel.id) { mutableStateOf(true) }

    LaunchedEffect(channel.id) {
        ActiveChat.show(channel.id)
        val loaded = runCatching { Database.messages(channel.id) }.getOrDefault(emptyList())
        rows = loaded.map { it.toRow(uid) }
        loading = false
        reactions.load(rows.map { it.id }, uid)

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

    ChatScaffold(
        title = "#" + channel.name,
        subtitle = serverName,
        avatarUrl = null,
        avatarName = "#" + channel.name,
        ownUserId = uid,
        rows = reactions.applyTo(rows),
        loading = loading,
        emptyText = "No messages yet",
        onSend = { text ->
            scope.launch {
                runCatching { Database.sendMessage(channel.id, uid, text) }
            }
        },
        onToggleReaction = { messageId, emoji ->
            scope.launch { reactions.toggle(messageId, emoji, uid) }
        },
        onBack = onBack,
    )
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