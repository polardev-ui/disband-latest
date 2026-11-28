package com.wsgpolar.disband.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wsgpolar.disband.core.Brand
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.core.TimeFormat
import com.wsgpolar.disband.data.ChatContext
import com.wsgpolar.disband.data.ChatKind
import com.wsgpolar.disband.data.MessageTools
import com.wsgpolar.disband.data.Profile
import com.wsgpolar.disband.ui.AvatarImage
import com.wsgpolar.disband.ui.components.DisplayNameText
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * The conversation's "more" menu in the chat bar: pinned messages, search
 * and your saved messages, as the web's channel header offers.
 */
@Composable
fun ConversationToolsButton(ctx: ChatContext) {
    val palette = LocalPalette.current
    var menu by remember { mutableStateOf(false) }
    var sheet by remember { mutableStateOf<String?>(null) }
    Box {
        Box(
            Modifier.size(48.dp).clip(CircleShape).background(palette.elevated)
                .clickable(role = Role.Button, onClickLabel = "More") { menu = true },
            contentAlignment = Alignment.Center,
        ) { Icon(Icons.Filled.MoreVert, contentDescription = "More", tint = palette.textPrimary, modifier = Modifier.size(20.dp)) }
        DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
            DropdownMenuItem(text = { Text("Pinned messages") }, leadingIcon = { Icon(Icons.Filled.PushPin, null) },
                onClick = { menu = false; sheet = "pins" })
            DropdownMenuItem(text = { Text(if (ctx.kind == ChatKind.Channel) "Search this space" else "Search") },
                leadingIcon = { Icon(Icons.Filled.Search, null) }, onClick = { menu = false; sheet = "search" })
            DropdownMenuItem(text = { Text("Saved messages") }, leadingIcon = { Icon(Icons.Filled.Bookmark, null) },
                onClick = { menu = false; sheet = "saved" })
        }
    }
    when (sheet) {
        "pins" -> PinnedMessagesSheet(ctx) { sheet = null }
        "search" -> SearchSheet(ctx) { sheet = null }
        "saved" -> SavedMessagesSheet { sheet = null }
    }
}

/** Pins per conversation this run, so the action sheet knows Pin from Unpin. */
internal object PinCache {
    val ids = mutableMapOf<String, Set<String>>()
    fun key(ctx: ChatContext) = "${ctx.kind.wire}:${ctx.id}"
}

/** Pin/unpin and save/unsave, added to the message action sheet. */
@Composable
internal fun MessageToolActions(ctx: ChatContext, row: ChatRow, onDismiss: () -> Unit, action: @Composable (String, androidx.compose.ui.graphics.vector.ImageVector, () -> Unit) -> Unit) {
    val scope = rememberCoroutineScope()
    val context = androidx.compose.ui.platform.LocalContext.current
    var pinned by remember(row.id) { mutableStateOf(PinCache.ids[PinCache.key(ctx)]?.contains(row.id)) }
    val saved by MessageTools.saved.collectAsState()
    LaunchedEffect(ctx) {
        runCatching { MessageTools.loadSaved() }
        if (pinned == null) runCatching { MessageTools.pins(ctx) }.getOrNull()?.let { list ->
            PinCache.ids[PinCache.key(ctx)] = list.map { it.messageId }.toSet()
            pinned = list.any { it.messageId == row.id }
        }
    }
    fun toast(text: String) = android.widget.Toast.makeText(context, text, android.widget.Toast.LENGTH_SHORT).show()
    val isPinned = pinned == true
    action(if (isPinned) "Unpin" else "Pin message", Icons.Filled.PushPin) {
        onDismiss()
        scope.launch {
            val key = PinCache.key(ctx)
            try {
                if (isPinned) MessageTools.unpin(ctx, row.id) else MessageTools.pin(ctx, row.id, row.content, row.authorId ?: row.author?.id)
                val now = PinCache.ids[key].orEmpty()
                PinCache.ids[key] = if (isPinned) now - row.id else now + row.id
                toast(if (isPinned) "Unpinned" else "Pinned")
            } catch (e: kotlinx.coroutines.CancellationException) { throw e }
            catch (_: Exception) { toast("You can't pin messages here.") }
        }
    }
    val isSaved = saved.any { it.context == ctx.kind.wire && it.messageId == row.id }
    action(if (isSaved) "Remove from saved" else "Save message", Icons.Filled.Bookmark) {
        onDismiss()
        scope.launch {
            try {
                if (isSaved) MessageTools.unsave(ctx.kind, row.id) else MessageTools.save(ctx, row.id)
                toast(if (isSaved) "Removed from saved" else "Saved")
            } catch (e: kotlinx.coroutines.CancellationException) { throw e }
            catch (_: Exception) { toast("Couldn't save that. Try again.") }
        }
    }
}


/** One message in a list sheet: author, time, text. */
@Composable
private fun ListedMessage(author: Profile?, createdAt: String?, content: String, trailing: (@Composable () -> Unit)? = null) {
    val palette = LocalPalette.current
    Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 10.dp)) {
        AvatarImage(url = author?.avatarUrl, name = author?.name ?: "?", size = 36.dp)
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                DisplayNameText(author, fontSize = 14.sp, modifier = Modifier.weight(1f, fill = false))
                Spacer(Modifier.width(6.dp))
                Text(TimeFormat.compact(createdAt), color = palette.textMuted, fontSize = 11.sp)
            }
            Text(content.ifBlank { "Attachment" }, color = palette.textPrimary, fontSize = 14.sp,
                maxLines = 5, overflow = TextOverflow.Ellipsis)
        }
        trailing?.invoke()
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ToolSheet(title: String, onDismiss: () -> Unit, content: @Composable () -> Unit) {
    val palette = LocalPalette.current
    ModalBottomSheet(onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = palette.surface) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(bottom = 16.dp)) {
            Text(title, color = palette.textPrimary, fontSize = 20.sp, fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp))
            content()
        }
    }
}

@Composable
private fun Centered(text: String?) {
    val palette = LocalPalette.current
    Box(Modifier.fillMaxWidth().height(140.dp), contentAlignment = Alignment.Center) {
        if (text == null) CircularProgressIndicator(color = palette.accent)
        else Text(text, color = palette.textMuted, fontSize = 14.sp, modifier = Modifier.padding(horizontal = 24.dp))
    }
}

@Composable
fun PinnedMessagesSheet(ctx: ChatContext, onDismiss: () -> Unit) {
    val scope = rememberCoroutineScope()
    var pins by remember { mutableStateOf<List<MessageTools.Pin>?>(null) }
    var authors by remember { mutableStateOf<Map<String, Profile>>(emptyMap()) }
    var error by remember { mutableStateOf<String?>(null) }
    suspend fun load() {
        val list = runCatching { MessageTools.pins(ctx) }
        list.onFailure { error = "Couldn't load pinned messages." }
        list.getOrNull()?.let { rows ->
            pins = rows
            PinCache.ids[PinCache.key(ctx)] = rows.map { it.messageId }.toSet()
            authors = runCatching { com.wsgpolar.disband.data.Database.profiles(rows.mapNotNull { it.authorId }) }.getOrDefault(emptyMap())
        }
    }
    LaunchedEffect(ctx) { load() }
    ToolSheet("Pinned messages", onDismiss) {
        val list = pins
        when {
            error != null && list == null -> Centered(error)
            list == null -> Centered(null)
            list.isEmpty() -> Centered("Nothing is pinned here yet. Long-press a message and choose Pin.")
            else -> LazyColumn(Modifier.heightIn(max = 560.dp)) {
                items(list, key = { it.id }) { pin ->
                    ListedMessage(pin.authorId?.let { authors[it] }, pin.createdAt, pin.content) {
                        TextButton(onClick = {
                            scope.launch { runCatching { MessageTools.unpin(ctx, pin.messageId) }; load() }
                        }) { Text("Unpin", color = Brand.dnd, fontSize = 13.sp) }
                    }
                }
            }
        }
    }
}

@Composable
fun SavedMessagesSheet(onDismiss: () -> Unit) {
    val scope = rememberCoroutineScope()
    var items by remember { mutableStateOf<List<MessageTools.Saved>?>(null) }
    var resolved by remember { mutableStateOf<Map<String, MessageTools.Resolved>>(emptyMap()) }
    LaunchedEffect(Unit) {
        val list = runCatching { MessageTools.loadSaved(force = true) }.getOrDefault(emptyList())
        resolved = runCatching {
            MessageTools.resolve(list.mapNotNull { s -> ChatKind.entries.firstOrNull { it.wire == s.context }?.let { it to s.messageId } })
        }.getOrDefault(emptyMap())
        items = list
    }
    ToolSheet("Saved messages", onDismiss) {
        val list = items
        when {
            list == null -> Centered(null)
            list.isEmpty() -> Centered("Save a message from its long-press menu to find it here.")
            else -> LazyColumn(Modifier.heightIn(max = 560.dp)) {
                items(list, key = { it.id }) { s ->
                    val r = resolved[s.messageId]
                    ListedMessage(r?.author, r?.createdAt ?: s.createdAt, r?.content ?: "This message isn't available any more.") {
                        TextButton(onClick = {
                            scope.launch {
                                ChatKind.entries.firstOrNull { it.wire == s.context }?.let { runCatching { MessageTools.unsave(it, s.messageId) } }
                                items = items?.filterNot { it.id == s.id }
                            }
                        }) { Text("Remove", color = Brand.dnd, fontSize = 13.sp) }
                    }
                }
            }
        }
    }
}

@Composable
fun SearchSheet(ctx: ChatContext, onDismiss: () -> Unit) {
    val palette = LocalPalette.current
    var query by remember { mutableStateOf("") }
    var hits by remember { mutableStateOf<List<MessageTools.Hit>?>(emptyList()) }
    var authors by remember { mutableStateOf<Map<String, Profile>>(emptyMap()) }
    var error by remember { mutableStateOf<String?>(null) }
    // A space's channels, for "in:general".
    val channels by androidx.compose.runtime.produceState<List<com.wsgpolar.disband.data.Channel>>(emptyList(), ctx.serverId) {
        ctx.serverId?.let { value = runCatching { com.wsgpolar.disband.data.Database.channels(it) }.getOrDefault(emptyList()) }
    }
    LaunchedEffect(query) {
        if (query.isBlank()) { hits = emptyList(); return@LaunchedEffect }
        delay(350)
        hits = null
        error = null
        val result = runCatching {
            MessageTools.search(ctx, query, wholeSpace = ctx.kind == ChatKind.Channel,
                channelByName = { name -> channels.firstOrNull { it.name.equals(name, ignoreCase = true) }?.id })
        }
        result.onFailure { error = "Search failed. Try again." }
        val list = result.getOrDefault(emptyList())
        authors = runCatching { com.wsgpolar.disband.data.Database.profiles(list.mapNotNull { it.authorId }) }.getOrDefault(emptyMap())
        hits = list
    }
    ToolSheet(if (ctx.kind == ChatKind.Channel) "Search this space" else "Search", onDismiss) {
        OutlinedTextField(
            value = query, onValueChange = { query = it.take(200) }, singleLine = true,
            placeholder = { Text("Search messages") }, shape = RoundedCornerShape(14.dp),
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        )
        Text("Filters: from:name  has:image|link|file|video|embed  before:/after:YYYY-MM-DD" +
            if (ctx.kind == ChatKind.Channel) "  in:channel" else "",
            color = palette.textMuted, fontSize = 11.sp, modifier = Modifier.padding(horizontal = 20.dp))
        val list = hits
        when {
            error != null -> Centered(error)
            list == null -> Centered(null)
            query.isBlank() -> Spacer(Modifier.height(24.dp))
            list.isEmpty() -> Centered("No results.")
            else -> {
                Text("${list.first().total} result${if (list.first().total == 1) "" else "s"}", color = palette.textMuted,
                    fontSize = 12.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 20.dp, vertical = 6.dp))
                LazyColumn(Modifier.heightIn(max = 520.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    items(list, key = { it.messageId }) { hit ->
                        val where = if (ctx.kind == ChatKind.Channel) channels.firstOrNull { it.id == hit.containerId }?.let { "#${it.name}" } else null
                        Column {
                            where?.let { Text(it, color = palette.textMuted, fontSize = 11.sp, fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.padding(start = 66.dp, top = 6.dp)) }
                            ListedMessage(hit.authorId?.let { authors[it] }, hit.createdAt,
                                hit.content + if (hit.attachmentCount > 0) "  📎 ${hit.attachmentCount}" else "")
                        }
                    }
                }
            }
        }
    }
}
