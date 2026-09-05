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
    var loading by remember(thread.id) { mutableStateOf(true) }

    LaunchedEffect(thread.id) {
        dmUnread.markActive(thread.id)
        ActiveChat.show(thread.id)
        runCatching { Database.markDmRead(thread.id) }

        val loaded = runCatching { Database.dmMessages(thread.id) }.getOrDefault(emptyList())
        rows = loaded.map { it.toRow() }
        loading = false

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
                    rows = rows.filterNot { it.id == msg.id } + msg.toRow()
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
        rows = rows,
        loading = loading,
        emptyText = "Say hi!",
        callAction = friend?.let { { CallActionButton(app, it) } },
        onSend = { text ->
            scope.launch {
                runCatching {
                    Database.sendDmMessage(thread.id, uid, text)
                }
                dmUnread.markActive(thread.id)
            }
        },
        onBack = onBack,
    )
}

private fun DmMessage.toRow(): ChatRow = ChatRow(
    id = id,
    author = author,
    content = content,
    attachmentType = attachmentType,
    createdAt = createdAt,
)