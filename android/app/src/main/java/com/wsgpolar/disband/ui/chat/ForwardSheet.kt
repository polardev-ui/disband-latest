package com.wsgpolar.disband.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wsgpolar.disband.core.Brand
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.data.AttachmentType
import com.wsgpolar.disband.data.Database
import com.wsgpolar.disband.data.FriendshipStatus
import com.wsgpolar.disband.data.StoredAttachment
import com.wsgpolar.disband.ui.AvatarImage
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

private data class ForwardTarget(
    val kind: Kind,
    /** Friend's user id for a DM, group id for a group. */
    val id: String,
    val label: String,
    val avatarUrl: String?,
) {
    enum class Kind { Dm, Group }
}

/**
 * The text a forward carries. Matches the web's `handleForward` exactly, so a
 * forward reads the same on every client: a "[Forwarded from Name]" line, then
 * the original text.
 */
internal fun forwardedContent(row: ChatRow, hasAttachments: Boolean): String {
    val prefix = row.author?.name?.let { "[Forwarded from $it]" } ?: "[Forwarded]"
    val body = row.content.ifBlank { if (hasAttachments) "" else "(attachment)" }
    return if (body.isEmpty()) prefix else "$prefix\n$body"
}

/**
 * Attachments to carry along. The web forwards text only, but it renders
 * attachments, so sending them along is strictly better. A poll is left out:
 * the poll id belongs to the original conversation.
 */
internal fun forwardedAttachments(row: ChatRow): List<StoredAttachment> {
    val list = row.attachments?.takeIf { it.isNotEmpty() }
        ?: row.attachmentUrl?.let { url ->
            listOf(StoredAttachment(url = url, type = row.attachmentType?.raw ?: "file",
                name = row.attachmentName, size = row.attachmentSize))
        }
        ?: emptyList()
    return list.filter { it.type != AttachmentType.Poll.raw }
}

/** Pick a friend or group chat to forward [row] to. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ForwardSheet(
    uid: String,
    row: ChatRow,
    onDismiss: () -> Unit,
    /** Called once the message is sent, with a short confirmation to show. */
    onForwarded: (String) -> Unit,
) {
    val palette = LocalPalette.current
    val scope = rememberCoroutineScope()
    var targets by remember { mutableStateOf<List<ForwardTarget>?>(null) }
    var query by remember { mutableStateOf("") }
    var sendingTo by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(uid) {
        val friends = runCatching { Database.friendships(uid) }.getOrNull()
        val groups = runCatching { Database.myGroups(uid) }.getOrNull()
        if (friends == null && groups == null) {
            error = "Couldn't load your conversations. Check your connection and try again."
            targets = emptyList()
            return@LaunchedEffect
        }
        val dms = friends.orEmpty()
            .filter { it.status == FriendshipStatus.Accepted }
            .mapNotNull { f ->
                val other = if (f.requesterId == uid) f.addressee else f.requester
                other?.let { ForwardTarget(ForwardTarget.Kind.Dm, it.id, it.name, it.avatarUrl) }
            }
            .sortedBy { it.label.lowercase() }
        val gs = groups.orEmpty()
            .map { ForwardTarget(ForwardTarget.Kind.Group, it.id, it.name, it.iconUrl) }
            .sortedBy { it.label.lowercase() }
        targets = dms + gs
    }

    fun forward(target: ForwardTarget) {
        if (sendingTo != null) return
        sendingTo = target.id
        error = null
        scope.launch {
            try {
                val attachments = forwardedAttachments(row)
                val content = forwardedContent(row, attachments.isNotEmpty())
                when (target.kind) {
                    ForwardTarget.Kind.Dm -> {
                        val threadId = Database.getOrCreateDmThread(target.id)
                        if (attachments.isEmpty()) Database.sendDmMessage(threadId, uid, content)
                        else Database.sendWithAttachments("dm", threadId, uid, content, attachments)
                    }
                    ForwardTarget.Kind.Group ->
                        if (attachments.isEmpty()) Database.sendGroupMessage(target.id, uid, content)
                        else Database.sendWithAttachments("group", target.id, uid, content, attachments)
                } ?: error("no row returned")
                onForwarded("Forwarded to ${target.label}")
                onDismiss()
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                error = "Couldn't forward to ${target.label}. Try again."
            } finally {
                sendingTo = null
            }
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = palette.surface,
    ) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(bottom = 16.dp)) {
            Text(
                "Forward message",
                color = palette.textPrimary,
                fontSize = 17.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
            )
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                placeholder = { Text("Search friends and groups") },
                singleLine = true,
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
            )
            error?.let {
                Text(it, color = Brand.dnd, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 20.dp, vertical = 6.dp))
            }
            val all = targets
            when {
                all == null -> Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = palette.accent)
                }
                else -> {
                    val q = query.trim().lowercase()
                    val shown = if (q.isEmpty()) all else all.filter { q in it.label.lowercase() }
                    if (shown.isEmpty()) Text(
                        if (all.isEmpty()) "Add a friend or join a group chat to forward messages."
                        else "No matches.",
                        color = palette.textMuted,
                        fontSize = 14.sp,
                        modifier = Modifier.padding(20.dp),
                    )
                    LazyColumn(Modifier.fillMaxWidth().heightIn(max = 420.dp)) {
                        items(shown, key = { "${it.kind}:${it.id}" }) { target ->
                            Row(
                                Modifier
                                    .fillMaxWidth()
                                    .clickable(enabled = sendingTo == null) { forward(target) }
                                    .padding(horizontal = 20.dp, vertical = 10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                AvatarImage(url = target.avatarUrl, name = target.label, size = 36.dp)
                                Spacer(Modifier.width(12.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(target.label, color = palette.textPrimary, fontSize = 15.sp, maxLines = 1)
                                    Text(
                                        if (target.kind == ForwardTarget.Kind.Dm) "Direct message" else "Group chat",
                                        color = palette.textMuted,
                                        fontSize = 12.sp,
                                    )
                                }
                                if (sendingTo == target.id) {
                                    CircularProgressIndicator(Modifier.size(18.dp), color = palette.accent, strokeWidth = 2.dp)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
