package com.wsgpolar.disband.ui.chat

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wsgpolar.disband.core.Brand
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.data.Channel
import com.wsgpolar.disband.data.ChannelType
import com.wsgpolar.disband.data.ForumPost
import com.wsgpolar.disband.data.ForumService
import com.wsgpolar.disband.state.AppState
import kotlinx.coroutines.launch

/**
 * A forum: its posts, pinned first then most recent activity. Each post is
 * its own thread (a child channel) and opens as a channel chat. "New post"
 * starts one with a title and an opening message.
 */
@Composable
fun ForumScreen(app: AppState, forum: Channel, serverName: String, onBack: () -> Unit) {
    val palette = LocalPalette.current
    val scope = rememberCoroutineScope()
    var posts by remember(forum.id) { mutableStateOf<List<ForumPost>>(emptyList()) }
    var loading by remember(forum.id) { mutableStateOf(true) }
    var error by remember(forum.id) { mutableStateOf<String?>(null) }
    var openPost by remember(forum.id) { mutableStateOf<ForumPost?>(null) }
    var composing by remember(forum.id) { mutableStateOf(false) }
    var reloadKey by remember(forum.id) { mutableStateOf(0) }

    LaunchedEffect(forum.id, reloadKey) {
        loading = true
        try {
            posts = ForumService.posts(forum.id)
                .sortedWith(compareByDescending<ForumPost> { it.pinned == true }
                    .thenByDescending { it.lastMessageAt ?: it.createdAt ?: "" })
            error = null
        } catch (e: kotlinx.coroutines.CancellationException) { throw e }
        catch (_: Exception) { error = "Couldn't load the posts." }
        loading = false
    }

    openPost?.let { post ->
        val thread = Channel(id = post.id, serverId = forum.serverId, name = post.title, type = ChannelType.Text,
            position = 0, parentId = forum.id)
        ChannelChatScreen(app, thread, "${forum.name} · $serverName") { openPost = null; reloadKey++ }
        return
    }

    BackHandler(onBack = onBack)

    if (composing) {
        NewPostDialog(
            onDismiss = { composing = false },
            onPost = { title, content ->
                val id = ForumService.create(forum.id, title, content)
                composing = false
                openPost = ForumPost(id = id, title = title)
            },
        )
    }

    Column(Modifier.fillMaxSize().background(palette.background).statusBarsPadding()) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = palette.textPrimary)
            }
            Column(Modifier.weight(1f)) {
                Text(forum.name, color = palette.textPrimary, fontSize = 17.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                Text(serverName, color = palette.textMuted, fontSize = 12.sp, maxLines = 1)
            }
            IconButton(onClick = { composing = true }) {
                Icon(Icons.Filled.Edit, "New post", tint = palette.accent)
            }
        }

        when {
            loading && posts.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = palette.accent)
            }
            error != null && posts.isEmpty() -> Box(Modifier.fillMaxSize().clickable { reloadKey++ }, contentAlignment = Alignment.Center) {
                Text("${error}\nTap to try again.", color = palette.textMuted, fontSize = 14.sp)
            }
            posts.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("No posts yet", color = palette.textPrimary, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(4.dp))
                    Text("Start the first conversation.", color = palette.textMuted, fontSize = 14.sp)
                    Spacer(Modifier.height(14.dp))
                    Text(
                        "New post",
                        color = androidx.compose.ui.graphics.Color.White,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.clip(RoundedCornerShape(12.dp)).background(palette.accent)
                            .clickable { composing = true }.padding(horizontal = 18.dp, vertical = 10.dp),
                    )
                }
            }
            else -> LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = 14.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(posts, key = { it.id }) { post -> PostCard(post) { openPost = post } }
                item { Spacer(Modifier.navigationBarsPadding()) }
            }
        }
    }
}

@Composable
private fun PostCard(post: ForumPost, onClick: () -> Unit) {
    val palette = LocalPalette.current
    Column(
        Modifier.fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(palette.surface)
            .border(1.dp, palette.divider, RoundedCornerShape(16.dp))
            .clickable(onClick = onClick)
            .padding(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (post.pinned == true) {
                Icon(Icons.Filled.PushPin, "Pinned", tint = palette.accent, modifier = Modifier.size(14.dp))
                Spacer(Modifier.width(6.dp))
            }
            Text(post.title, color = palette.textPrimary, fontSize = 16.sp, fontWeight = FontWeight.Bold,
                maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        post.opening?.takeIf { it.isNotBlank() }?.let {
            Spacer(Modifier.height(6.dp))
            Text(it, color = palette.textSecondary, fontSize = 14.sp, maxLines = 3, overflow = TextOverflow.Ellipsis)
        }
        post.tags?.takeIf { it.isNotEmpty() }?.let { tags ->
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                tags.take(4).forEach { tag ->
                    Text(tag, color = palette.textSecondary, fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.clip(RoundedCornerShape(50)).background(palette.surfaceRaised)
                            .padding(horizontal = 8.dp, vertical = 3.dp))
                }
            }
        }
        Spacer(Modifier.height(8.dp))
        val replies = ((post.messageCount ?: 1) - 1).coerceAtLeast(0)
        Text(if (replies == 1) "1 reply" else "$replies replies", color = palette.textMuted, fontSize = 12.sp)
    }
}

@Composable
private fun NewPostDialog(onDismiss: () -> Unit, onPost: suspend (String, String) -> Unit) {
    val palette = LocalPalette.current
    val scope = rememberCoroutineScope()
    var title by remember { mutableStateOf("") }
    var content by remember { mutableStateOf("") }
    var posting by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val ready = title.isNotBlank() && content.isNotBlank()

    AlertDialog(
        onDismissRequest = { if (!posting) onDismiss() },
        containerColor = palette.surfaceRaised,
        title = { Text("New post", color = palette.textPrimary, fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(title, { title = it.take(100) }, singleLine = true,
                    placeholder = { Text("Title", color = palette.textMuted) }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(content, { content = it }, minLines = 4,
                    placeholder = { Text("Say more…", color = palette.textMuted) }, modifier = Modifier.fillMaxWidth())
                error?.let { Text(it, color = Brand.dnd, fontSize = 13.sp) }
            }
        },
        confirmButton = {
            if (posting) CircularProgressIndicator(color = palette.accent, strokeWidth = 2.dp, modifier = Modifier.size(22.dp))
            else TextButton(enabled = ready, onClick = {
                posting = true
                error = null
                scope.launch {
                    try { onPost(title.trim(), content.trim()) }
                    catch (e: kotlinx.coroutines.CancellationException) { throw e }
                    catch (e: Exception) { error = e.message ?: "Couldn't post. Try again." }
                    posting = false
                }
            }) { Text("Post", color = if (ready) palette.accent else palette.textMuted, fontWeight = FontWeight.SemiBold) }
        },
        dismissButton = { TextButton(enabled = !posting, onClick = onDismiss) { Text("Cancel", color = palette.textSecondary) } },
    )
}
