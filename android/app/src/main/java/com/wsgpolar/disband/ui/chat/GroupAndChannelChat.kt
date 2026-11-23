package com.wsgpolar.disband.ui.chat

import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.MoreVert
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
fun GroupChatScreen(
    app: AppState,
    group: GroupChat,
    onBack: () -> Unit,
    /** The group's icon or membership changed: the inbox list needs reloading. */
    onGroupChanged: () -> Unit = {},
) {
    val uid = app.currentUserId ?: return
    val dmUnread = app.dmUnread
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current

    val typing = remember(group.id) { TypingState("group", group.id, scope) }
    val timeline = rememberChatTimeline(
        key = "group:${group.id}", table = "group_messages", filter = "group_id=eq.${group.id}",
        serializer = GroupMessage.serializer(), toRow = { it.toRow(uid) },
        fetch = { before -> Database.groupMessages(group.id, before = before).map { it.toRow(uid) } },
        onIncoming = { row -> row.authorId?.let { typing.clear(it) }; if (row.authorId != uid) runCatching { Database.markGroupRead(group.id) } },
    )
    val rows = timeline.rows

    var sendError by remember(group.id) { mutableStateOf<String?>(null) }
    var replyTo by remember(group.id) { mutableStateOf<ChatRow?>(null) }
    var editingRow by remember(group.id) { mutableStateOf<ChatRow?>(null) }
    var actionRow by remember(group.id) { mutableStateOf<ChatRow?>(null) }
    var deleteRow by remember(group.id) { mutableStateOf<ChatRow?>(null) }
    val reactions = remember(group.id) { ReactionState("group") }
    val ctx = LocalContext.current
    val attach = remember(group.id) { AttachmentSender("group", group.id) }
    attach.maxUploadBytes = app.subscriptions.entitlements.maxUploadBytes

    // The group's picture: change or remove it from the header's menu.
    var groupIcon by remember(group.id) { mutableStateOf(group.iconUrl) }
    var optionsOpen by remember(group.id) { mutableStateOf(false) }
    var confirmLeave by remember(group.id) { mutableStateOf(false) }
    var groupName by remember(group.id) { mutableStateOf(group.name) }
    var renaming by remember(group.id) { mutableStateOf(false) }
    var addingPeople by remember(group.id) { mutableStateOf(false) }
    if (renaming) RenameGroupDialog(group.id, groupName, onDismiss = { renaming = false },
        onRenamed = { groupName = it; onGroupChanged() })
    if (addingPeople) AddGroupMembersSheet(
        uid = uid,
        groupId = group.id,
        currentMemberIds = group.members?.mapTo(hashSetOf()) { it.id } ?: setOf(uid),
        onDismiss = { addingPeople = false },
        onAdded = onGroupChanged,
    )
    if (confirmLeave) AlertDialog(
        onDismissRequest = { confirmLeave = false },
        title = { Text("Leave ${group.name}?") },
        text = { Text("You'll stop getting its messages. Someone in the group will have to add you back.") },
        confirmButton = {
            TextButton(onClick = {
                confirmLeave = false
                scope.launch {
                    try {
                        Database.leaveGroup(group.id)
                        onGroupChanged()
                        onBack()
                    } catch (e: kotlinx.coroutines.CancellationException) { throw e }
                    catch (_: Exception) { sendError = "Couldn't leave the group. Try again." }
                }
            }) { Text("Leave", color = Brand.dnd) }
        },
        dismissButton = { TextButton(onClick = { confirmLeave = false }) { Text("Cancel") } },
    )
    val pickIcon = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.PickVisualMedia(),
    ) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            runCatching {
                val bytes = ctx.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: error("unreadable")
                val mime = ctx.contentResolver.getType(uri) ?: "image/jpeg"
                val url = com.wsgpolar.disband.data.MediaService.uploadImage(bytes, filename = "group-icon", mimeType = mime).url
                Database.setGroupIcon(group.id, url)
                groupIcon = url
                onGroupChanged()
            }.onFailure { sendError = "The group picture couldn't be changed. Try again." }
        }
    }

    LaunchedEffect(rows.map { it.id }) { reactions.load(rows.map { it.id }, uid) }
    LaunchedEffect(group.id) { val latest = { timeline.rows.map { it.id } }; reactions.watch(latest, uid) }

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

    val startGroupCall = com.wsgpolar.disband.ui.calls.rememberAudioPermissionTrigger {
        app.voice.startGroupCall(
            groupId = group.id,
            name = groupName,
            iconUrl = groupIcon,
            memberIds = group.members.orEmpty().map { it.id },
            callerName = app.profile.value?.name ?: "Someone",
        )
    }

    ChatScaffold(
        mentionSource = MentionSource.Local(group.members.orEmpty().filter { it.id != uid }),
        title = groupName,
        subtitle = if (group.members.isNullOrEmpty()) "Group chat" else "${group.members!!.size} members",
        avatarUrl = groupIcon,
        avatarName = groupName,
        callAction = {
            androidx.compose.foundation.layout.Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
            androidx.compose.material3.IconButton(onClick = { startGroupCall() }) {
                androidx.compose.material3.Icon(
                    androidx.compose.material.icons.Icons.Filled.Call,
                    contentDescription = "Start group call",
                    tint = Brand.online,
                )
            }
            androidx.compose.foundation.layout.Box {
                androidx.compose.material3.IconButton(onClick = { optionsOpen = true }) {
                    androidx.compose.material3.Icon(
                        androidx.compose.material.icons.Icons.Filled.MoreVert,
                        contentDescription = "Group options",
                    )
                }
                androidx.compose.material3.DropdownMenu(expanded = optionsOpen, onDismissRequest = { optionsOpen = false }) {
                    androidx.compose.material3.DropdownMenuItem(
                        text = { androidx.compose.material3.Text(if (groupIcon == null) "Add icon" else "Change icon") },
                        onClick = {
                            optionsOpen = false
                            pickIcon.launch(
                                androidx.activity.result.PickVisualMediaRequest(
                                    androidx.activity.result.contract.ActivityResultContracts.PickVisualMedia.ImageOnly,
                                ),
                            )
                        },
                    )
                    if (groupIcon != null) {
                        androidx.compose.material3.DropdownMenuItem(
                            text = { androidx.compose.material3.Text("Remove icon") },
                            onClick = {
                                optionsOpen = false
                                scope.launch {
                                    runCatching { Database.setGroupIcon(group.id, null); groupIcon = null; onGroupChanged() }
                                        .onFailure { sendError = "The group picture couldn't be removed. Try again." }
                                }
                            },
                        )
                    }
                    androidx.compose.material3.DropdownMenuItem(
                        text = { Text("Add people") },
                        onClick = { optionsOpen = false; addingPeople = true },
                    )
                    // rename_group_chat is owner-only; don't offer what will be refused.
                    if (group.ownerId == uid) androidx.compose.material3.DropdownMenuItem(
                        text = { Text("Rename group") },
                        onClick = { optionsOpen = false; renaming = true },
                    )
                    androidx.compose.material3.DropdownMenuItem(
                        text = { Text("Leave group", color = Brand.dnd) },
                        onClick = { optionsOpen = false; confirmLeave = true },
                    )
                }
            }
            }
        },
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
                    Database.editGroupMessage(target.id, text)
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
            val sent = try { Database.sendGroupMessage(group.id, uid, text, replyToId = replyId) }
                catch (e: kotlinx.coroutines.CancellationException) { throw e }
                catch (_: Exception) { null }
            if (sent == null) {
                sendError = "Couldn't send. Your draft is saved — try again."
                false
            } else {
                val messageId = sent.id
                // A successful HTTP response is enough to show our message. The
                // socket may be late or reconnecting; its echo shares this id.
                if (timeline.rows.none { it.id == messageId }) timeline.upsert(ChatRow(
                    id = messageId, author = app.profile.value, authorId = uid,
                    content = text, attachmentType = null, createdAt = sent.createdAt ?: sentAt, replyToId = replyId,
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

    var forwardRow by remember { mutableStateOf<ChatRow?>(null) }
    forwardRow?.let { row ->
        ForwardSheet(uid = uid, row = row, onDismiss = { forwardRow = null }, onForwarded = { message ->
            android.widget.Toast.makeText(ctx, message, android.widget.Toast.LENGTH_SHORT).show()
        })
    }

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

    val typing = remember(channel.id) { TypingState("ch", channel.id, scope) }
    val timeline = rememberChatTimeline(
        key = "channel:${channel.id}", table = "messages", filter = "channel_id=eq.${channel.id}",
        serializer = Message.serializer(), toRow = { it.toRow(uid) },
        fetch = { before -> Database.messages(channel.id, before = before).map { it.toRow(uid) } },
        onIncoming = { row -> row.authorId?.let { typing.clear(it) }; if (row.authorId != uid) com.wsgpolar.disband.data.ChannelUnreads.sawMessage(channel.id) },
    )
    val rows = timeline.rows

    // Keyed by channel: the old unkeyed remember leaked one channel's
    // reactions into the next channel opened.
    val reactions = remember(channel.id) { ReactionState("channel") }
    val ctx = LocalContext.current
    // "ch" matches iOS `typing:ch:{id}` — "channel" would be a topic nobody
    // else listens on, silently dropping typing indicators cross-platform.
    val attach = remember(channel.id) { AttachmentSender("channel", channel.id) }
    attach.maxUploadBytes = app.subscriptions.entitlements.maxUploadBytes
    var sendError by remember(channel.id) { mutableStateOf<String?>(null) }
    var replyTo by remember(channel.id) { mutableStateOf<ChatRow?>(null) }
    var editingRow by remember(channel.id) { mutableStateOf<ChatRow?>(null) }
    var actionRow by remember(channel.id) { mutableStateOf<ChatRow?>(null) }
    var deleteRow by remember(channel.id) { mutableStateOf<ChatRow?>(null) }

    LaunchedEffect(rows.map { it.id }) { reactions.load(rows.map { it.id }, uid) }
    LaunchedEffect(channel.id) { val latest = { timeline.rows.map { it.id } }; reactions.watch(latest, uid) }

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
                // Clears this channel here and on every other device.
                com.wsgpolar.disband.data.ChannelUnreads.open(channel.id)
                typing.start(uid) { id -> runCatching { Database.profile(id) }.getOrNull() }
                awaitCancellation()
            } finally {
                typing.stop()
                com.wsgpolar.disband.data.ChannelUnreads.close(channel.id)
                if (ActiveChat.isShowing(channel.id)) ActiveChat.clear()
            }
        }
    }

    // An announcement channel is closed only to people who can't manage
    // channels. This locked it for everyone, so a space's own owner was told
    // only moderators could post. my_server_permissions reports everything
    // as allowed for the owner.
    // The space's roles, so role pings show in their colour.
    LaunchedEffect(channel.serverId) {
        runCatching { com.wsgpolar.disband.data.ServerAdmin.roles(channel.serverId) }
            .onSuccess { list -> ChatMarkdown.setRoles(list.map { it.name to it.color }) }
    }
    val permissions by androidx.compose.runtime.produceState<Map<String, Boolean>?>(null, channel.serverId) {
        value = com.wsgpolar.disband.data.ServerAdmin.permissions(channel.serverId)
    }
    val readOnly = channel.readOnly == true && permissions?.get("manage_channels") != true
    ChatScaffold(
        mentionSource = MentionSource.Space(channel.serverId),
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
        commandBar = { draft, clear -> BotCommandBar(channel.serverId, channel.id, draft, clear) },
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
                    Database.editChannelMessage(target.id, text)
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
            val sent = try { Database.sendMessage(channel.id, uid, text, replyToId = replyId) }
                catch (e: kotlinx.coroutines.CancellationException) { throw e }
                catch (_: Exception) { null }
            if (sent == null) {
                sendError = "Couldn't send. Your draft is saved — try again."
                false
            } else {
                val messageId = sent.id
                // A successful HTTP response is enough to show our message. The
                // socket may be late or reconnecting; its echo shares this id.
                if (timeline.rows.none { it.id == messageId }) timeline.upsert(ChatRow(
                    id = messageId, author = app.profile.value, authorId = uid,
                    content = text, attachmentType = null, createdAt = sent.createdAt ?: sentAt, replyToId = replyId,
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

    var forwardRow by remember { mutableStateOf<ChatRow?>(null) }
    forwardRow?.let { row ->
        ForwardSheet(uid = uid, row = row, onDismiss = { forwardRow = null }, onForwarded = { message ->
            android.widget.Toast.makeText(ctx, message, android.widget.Toast.LENGTH_SHORT).show()
        })
    }

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

/** @everyone and @here ping every member when the author was allowed to (mention_everyone), as on the web. */
private val EVERYONE_PING = Regex("@(everyone|here)\\b", RegexOption.IGNORE_CASE)

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
    mentions?.contains(me) == true || (mentionEveryone && EVERYONE_PING.containsMatchIn(content))
    ),
    createdAt = createdAt,
    embeds = embeds.orEmpty(),
    webhook = webhook,
    interaction = com.wsgpolar.disband.data.BotService.parseInteraction(interaction),
    buttons = com.wsgpolar.disband.data.BotService.parseButtons(components),
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
