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

    LaunchedEffect(group.id) {
        dmUnread.markGroupActive(group.id)
        ActiveChat.show(group.id)
        runCatching { Database.markGroupRead(group.id) }

        val loaded = runCatching { Database.groupMessages(group.id) }.getOrDefault(emptyList())
        rows = loaded.map { it.toRow() }
        loading = false

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
                    rows = rows.filterNot { it.id == msg.id } + msg.toRow()
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
        rows = rows,
        loading = loading,
        emptyText = "No messages yet",
        onSend = { text ->
            scope.launch {
                runCatching { Database.sendGroupMessage(group.id, uid, text) }
                dmUnread.markGroupActive(group.id)
            }
        },
        onBack = onBack,
    )
}

@Composable
fun ChannelChatScreen(app: AppState, channel: Channel, serverName: String, onBack: () -> Unit) {
    val uid = app.currentUserId ?: return
    val scope = rememberCoroutineScope()

    var rows by remember(channel.id) { mutableStateOf<List<ChatRow>>(emptyList()) }
    var loading by remember(channel.id) { mutableStateOf(true) }

    LaunchedEffect(channel.id) {
        ActiveChat.show(channel.id)
        val loaded = runCatching { Database.messages(channel.id) }.getOrDefault(emptyList())
        rows = loaded.map { it.toRow() }
        loading = false

        val live = runCatching {
            RealtimeService.observeInserts("messages", "channel_id=eq.${channel.id}", Message.serializer())
        }.getOrNull()
        if (live != null) {
            try {
                live.flow.collect { msg ->
                    rows = rows.filterNot { it.id == msg.id } + msg.toRow()
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
        rows = rows,
        loading = loading,
        emptyText = "No messages yet",
        onSend = { text ->
            scope.launch {
                runCatching { Database.sendMessage(channel.id, uid, text) }
            }
        },
        onBack = onBack,
    )
}

private fun Message.toRow(): ChatRow = ChatRow(
    id = id,
    author = author,
    content = content,
    attachmentType = attachmentType,
    createdAt = createdAt,
)

private fun GroupMessage.toRow(): ChatRow = ChatRow(
    id = id,
    author = author,
    content = content,
    attachmentType = attachmentType,
    createdAt = createdAt,
)