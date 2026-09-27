package com.wsgpolar.disband.ui.main

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.core.ShellMetrics
import com.wsgpolar.disband.core.TimeFormat
import com.wsgpolar.disband.data.DmThread
import com.wsgpolar.disband.data.GroupChat
import com.wsgpolar.disband.data.UserStatus

/** All / Unread / Groups, matching iOS InboxPanel.Filter. */
enum class InboxFilter(val label: String) {
    All("All"),
    Unread("Unread"),
    Groups("Groups"),
}

/** A DM or a group chat, interleaved by recency as iOS does. */
private sealed interface InboxItem {
    val key: String

    data class Dm(val thread: DmThread) : InboxItem {
        override val key get() = "dm:${thread.id}"
    }

    data class Group(val group: GroupChat) : InboxItem {
        override val key get() = "group:${group.id}"
    }
}

@Composable
fun InboxPanel(
    dmThreads: List<DmThread>,
    groupChats: List<GroupChat>,
    selectedThreadId: String?,
    onThreadSelected: (String) -> Unit,
    onGroupSelected: (GroupChat) -> Unit,
    filter: InboxFilter,
    onFilterChanged: (InboxFilter) -> Unit,
    statusOf: (String) -> UserStatus = { UserStatus.Offline },
    unreadForThread: (String) -> Int = { 0 },
    unreadForGroup: (String) -> Int = { 0 },
    onCompose: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val palette = LocalPalette.current
    // Bottom clearance: fixed dock margin + the gesture/navigation bar inset,
    // so the last row clears the floating dock on every device.
    val navBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()

    // Unread first, then most recent — the same ordering iOS applies.
    val items: List<InboxItem> = buildList {
        if (filter != InboxFilter.Groups) {
            dmThreads.forEach { add(InboxItem.Dm(it)) }
        }
        groupChats.forEach { add(InboxItem.Group(it)) }
    }.let { list ->
        val filtered = if (filter == InboxFilter.Unread) {
            list.filter {
                when (it) {
                    is InboxItem.Dm -> unreadForThread(it.thread.id) > 0
                    is InboxItem.Group -> unreadForGroup(it.group.id) > 0
                }
            }
        } else {
            list
        }
        filtered.sortedWith(
            compareByDescending<InboxItem> {
                when (it) {
                    is InboxItem.Dm -> unreadForThread(it.thread.id) > 0
                    is InboxItem.Group -> unreadForGroup(it.group.id) > 0
                }
            }.thenByDescending {
                when (it) {
                    is InboxItem.Dm -> it.thread.lastMessageAt ?: it.thread.createdAt ?: ""
                    is InboxItem.Group -> it.group.createdAt ?: ""
                }
            },
        )
    }

    LazyColumn(
        // The SpacesView panel supplies the surface background; the list sits
        // directly on it, as on iOS.
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = navBottom + ShellMetrics.listBottomMargin),
    ) {
        item(key = "header") {
            Row(
                Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "Messages",
                    color = palette.textPrimary,
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1f),
                )
                Box(
                    Modifier
                        .size(36.dp)
                        .clip(CircleShape)
                        .background(palette.elevated)
                        .clickable(onClickLabel = "New message", onClick = onCompose),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        Icons.Filled.Edit,
                        contentDescription = "New message",
                        tint = palette.textPrimary,
                        modifier = Modifier.size(17.dp),
                    )
                }
            }
        }

        item(key = "filters") {
            Row(
                Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, bottom = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                InboxFilter.entries.forEach { option ->
                    val selected = option == filter
                    Box(
                        Modifier
                            .height(32.dp)
                            .clip(CircleShape)
                            .background(if (selected) palette.accent else palette.elevated)
                            .clickable { onFilterChanged(option) }
                            .padding(horizontal = 14.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            option.label,
                            color = if (selected) Color.White else palette.textSecondary,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
            }
        }

        if (items.isEmpty()) {
            item(key = "empty") {
                Column(
                    Modifier.fillMaxWidth().padding(top = 70.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Text(
                        if (filter == InboxFilter.Unread) "You're all caught up." else "No conversations yet.",
                        color = palette.textPrimary,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                    if (filter != InboxFilter.Unread) {
                        Text("Start one from Friends.", color = palette.textMuted, fontSize = 14.sp)
                    }
                }
            }
        }

        items(items, key = { it.key }) { item ->
            when (item) {
                is InboxItem.Dm -> {
                    val friend = item.thread.friend
                    ConversationRow(
                        iconUrl = friend?.avatarUrl,
                        name = friend?.name ?: "Unknown",
                        status = friend?.let { statusOf(it.id) },
                        preview = item.thread.lastMessagePreview,
                        time = TimeFormat.compact(item.thread.lastMessageAt ?: item.thread.createdAt),
                        unread = unreadForThread(item.thread.id),
                        selected = item.thread.id == selectedThreadId,
                        onClick = { onThreadSelected(item.thread.id) },
                    )
                }

                is InboxItem.Group -> ConversationRow(
                    iconUrl = item.group.iconUrl,
                    name = item.group.name,
                    subtitle = "${item.group.members?.size ?: 0} members",
                    unread = unreadForGroup(item.group.id),
                    selected = item.group.id == selectedThreadId,
                    onClick = { onGroupSelected(item.group) },
                )
            }
        }
    }
}

