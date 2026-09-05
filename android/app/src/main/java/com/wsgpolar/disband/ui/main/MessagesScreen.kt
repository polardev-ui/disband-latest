package com.wsgpolar.disband.ui.main

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
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
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.core.TimeFormat
import com.wsgpolar.disband.data.Database
import com.wsgpolar.disband.data.DmThread
import com.wsgpolar.disband.data.GroupChat
import com.wsgpolar.disband.data.Profile
import com.wsgpolar.disband.state.AppState
import com.wsgpolar.disband.ui.AvatarImage
import com.wsgpolar.disband.ui.chat.CallActionButton
import com.wsgpolar.disband.ui.chat.DmChatScreen
import com.wsgpolar.disband.ui.chat.GroupChatScreen
import kotlinx.coroutines.launch

@Composable
fun MessagesScreen(app: AppState) {
    val uid = app.currentUserId
    var threads by remember { mutableStateOf<List<DmThread>>(emptyList()) }
    var groups by remember { mutableStateOf<List<GroupChat>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }

    var openThread by remember { mutableStateOf<DmThread?>(null) }
    var openGroup by remember { mutableStateOf<GroupChat?>(null) }
    var adding by remember { mutableStateOf(false) }

    LaunchedEffect(uid) {
        if (uid == null) return@LaunchedEffect
        loading = true
        threads = runCatching { Database.myDmThreads(uid) }.getOrDefault(emptyList())
        groups = runCatching { Database.myGroups(uid) }.getOrDefault(emptyList())
        loading = false

        // The list used to load once and never change, so a message arriving —
        // or one you sent yourself — neither surfaced nor reordered the
        // conversation until the app was restarted. Sorting by recency is only
        // useful if the list is actually kept current.
        val dmLive = runCatching {
            com.wsgpolar.disband.data.RealtimeService.observeChanges("dm_messages")
        }.getOrNull()
        val groupLive = runCatching {
            com.wsgpolar.disband.data.RealtimeService.observeChanges("group_messages")
        }.getOrNull()
        try {
            kotlinx.coroutines.flow.merge(
                dmLive?.flow ?: kotlinx.coroutines.flow.emptyFlow(),
                groupLive?.flow ?: kotlinx.coroutines.flow.emptyFlow(),
            ).collect {
                threads = runCatching { Database.myDmThreads(uid) }.getOrDefault(threads)
                groups = runCatching { Database.myGroups(uid) }.getOrDefault(groups)
            }
        } finally {
            runCatching { dmLive?.channel?.unsubscribe() }
            runCatching { groupLive?.channel?.unsubscribe() }
        }
    }

    val open = openThread
    if (open != null) {
        DmChatScreen(app = app, thread = open, onBack = { openThread = null })
        return
    }
    val openG = openGroup
    if (openG != null) {
        GroupChatScreen(app = app, group = openG, onBack = { openGroup = null })
        return
    }

    MessagesList(
        app = app,
        threads = threads,
        groups = groups,
        loading = loading,
        adding = adding,
        onToggleAdd = { adding = !adding },
        onOpenThread = { openThread = it },
        onOpenGroup = { openGroup = it },
        onAddedThread = { openThread = it },
    )
}

@Composable
private fun MessagesList(
    app: AppState,
    threads: List<DmThread>,
    groups: List<GroupChat>,
    loading: Boolean,
    adding: Boolean,
    onToggleAdd: () -> Unit,
    onOpenThread: (DmThread) -> Unit,
    onOpenGroup: (GroupChat) -> Unit,
    onAddedThread: (DmThread) -> Unit,
) {
    val palette = LocalPalette.current
    val unread = app.dmUnread
    val scope = rememberCoroutineScope()

    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<Profile>>(emptyList()) }
    var searching by remember { mutableStateOf(false) }

    when {
        loading && threads.isEmpty() && groups.isEmpty() ->
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = palette.accent)
            }
        else -> LazyColumn(Modifier.fillMaxSize().background(palette.background)) {
            item {
                SectionHeader("Direct Messages", onToggleAdd = onToggleAdd, adding = adding)
            }
            if (adding) {
                item {
                    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically) {
                        OutlinedTextField(
                            value = query,
                            onValueChange = { q ->
                                query = q
                                if (q.isNotBlank()) {
                                    searching = true
                                    scope.launch {
                                        results = runCatching { Database.searchProfiles(q) }
                                            .getOrDefault(emptyList())
                                        searching = false
                                    }
                                } else {
                                    results = emptyList()
                                    searching = false
                                }
                            },
                            modifier = Modifier.weight(1f),
                            placeholder = { Text("Search people", color = palette.textMuted) },
                        )
                        Spacer(Modifier.width(8.dp))
                        if (searching) {
                            CircularProgressIndicator(
                                color = palette.accent, modifier = Modifier.size(20.dp),
                            )
                        }
                    }
                }
                items(results, key = { "search:${it.id}" }) { profile ->
                    SearchResultRow(profile = profile, palette, onClick = {
                        scope.launch {
                            val threadId = runCatching { Database.getOrCreateDmThread(profile.id) }
                                .getOrNull()
                            if (threadId != null) {
                                val friend = runCatching { Database.profile(profile.id) }
                                    .getOrNull() ?: profile
                                onAddedThread(DmThread(id = threadId, userA = "", userB = "", friend = friend))
                            }
                        }
                    })
                }
                if (query.isNotBlank() && results.isEmpty() && !searching) {
                    item {
                        Text("No one found", color = palette.textMuted,
                            fontSize = 13.sp, modifier = Modifier.padding(16.dp))
                    }
                }
            }
            if (threads.isEmpty()) {
                item {
                    Text("No conversations yet", color = palette.textMuted, fontSize = 14.sp,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
                }
            } else {
                items(threads, key = { it.id }) { thread ->
                    val friend = thread.friend
                    ThreadRow(
                        thread = thread,
                        unreadCount = unread.count(thread.id),
                        palette = palette,
                        onOpen = { onOpenThread(thread) },
                        call = friend?.let { peer -> @Composable { CallActionButton(app, peer) } },
                    )
                }
            }
            if (groups.isNotEmpty()) {
                item { SectionHeader("Group Chats", onToggleAdd = null, adding = false) }
                items(groups, key = { it.id }) { group ->
                    GroupRow(group = group, unreadCount = unread.countGroup(group.id), palette = palette,
                        onOpen = { onOpenGroup(group) })
                }
            }
        }
    }
}

@Composable
private fun SectionHeader(title: String, onToggleAdd: (() -> Unit)?, adding: Boolean) {
    val palette = LocalPalette.current
    Row(
        Modifier.fillMaxWidth().padding(start = 16.dp, end = 8.dp, top = 14.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(title, color = palette.textMuted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
            modifier = Modifier.weight(1f))
        if (onToggleAdd != null) {
            IconButton(onClick = onToggleAdd, modifier = Modifier.size(32.dp)) {
                Icon(
                    if (adding) Icons.Filled.Search else Icons.Filled.Add,
                    contentDescription = if (adding) "Close search" else "New DM",
                    tint = palette.accent,
                    modifier = Modifier.size(18.dp),
                )
            }
        }
    }
}

@Composable
private fun SearchResultRow(profile: Profile, palette: com.wsgpolar.disband.core.Palette, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick)
        .padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        AvatarImage(url = profile.avatarUrl, name = profile.name, size = 36.dp)
        Column(Modifier.padding(start = 10.dp)) {
            Text(profile.name, color = palette.textPrimary, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            Text("@" + profile.handle, color = palette.textMuted, fontSize = 13.sp)
        }
    }
}

@Composable
private fun ThreadRow(
    thread: DmThread,
    unreadCount: Int,
    palette: com.wsgpolar.disband.core.Palette,
    onOpen: () -> Unit,
    call: (@Composable () -> Unit)?,
) {
    val friend = thread.friend
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onOpen).padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AvatarImage(url = friend?.avatarUrl, name = friend?.name ?: "?", size = 44.dp)
        Column(Modifier.padding(start = 12.dp).weight(1f)) {
            Text(friend?.name ?: "Unknown", color = palette.textPrimary, fontSize = 15.sp,
                fontWeight = if (unreadCount > 0) FontWeight.SemiBold else FontWeight.Normal)
            Row {
                Text(
                    thread.lastMessagePreview ?: "Tap to message",
                    color = if (unreadCount > 0) palette.textSecondary else palette.textMuted,
                    fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                Text(TimeFormat.compact(thread.lastMessageAt), color = palette.textMuted,
                    fontSize = 12.sp, modifier = Modifier.padding(start = 8.dp))
            }
        }
        if (unreadCount > 0) {
            Box(
                Modifier
                    .padding(start = 8.dp)
                    .size(22.dp)
                    .clip(CircleShape)
                    .background(palette.accent),
                contentAlignment = Alignment.Center,
            ) {
                Text("$unreadCount", color = androidx.compose.ui.graphics.Color.White,
                    fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            }
        }
        call?.invoke()
    }
    HorizontalDivider(color = palette.divider, modifier = Modifier.padding(start = 72.dp))
}

@Composable
private fun GroupRow(
    group: GroupChat,
    unreadCount: Int,
    palette: com.wsgpolar.disband.core.Palette,
    onOpen: () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onOpen).padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AvatarImage(url = group.iconUrl, name = group.name, size = 44.dp)
        Column(Modifier.padding(start = 12.dp).weight(1f)) {
            Text(group.name, color = palette.textPrimary, fontSize = 15.sp,
                fontWeight = if (unreadCount > 0) FontWeight.SemiBold else FontWeight.Normal)
            Text("${group.members?.size ?: 0} members", color = palette.textMuted, fontSize = 13.sp)
        }
        if (unreadCount > 0) {
            Box(
                Modifier
                    .padding(start = 8.dp)
                    .size(22.dp)
                    .clip(CircleShape)
                    .background(palette.accent),
                contentAlignment = Alignment.Center,
            ) {
                Text("$unreadCount", color = androidx.compose.ui.graphics.Color.White,
                    fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            }
        }
        IconButton(onClick = onOpen) {
            Icon(Icons.Filled.Add, contentDescription = "Open", tint = palette.textMuted,
                modifier = Modifier.size(18.dp))
        }
    }
    HorizontalDivider(color = palette.divider, modifier = Modifier.padding(start = 72.dp))
}