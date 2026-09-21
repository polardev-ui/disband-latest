package com.wsgpolar.disband.ui.main

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.data.DmThread
import com.wsgpolar.disband.data.GroupChat
import com.wsgpolar.disband.ui.AvatarImage

enum class InboxFilter(val label: String) {
    Messages("Messages"),
    Groups("Groups"),
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
    modifier: Modifier = Modifier,
) {
    val palette = LocalPalette.current

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(palette.background),
    ) {
        // Filter tabs
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            InboxFilter.entries.forEach { f ->
                val isSelected = filter == f
                FilterTab(
                    label = f.label,
                    isSelected = isSelected,
                    onSelected = { onFilterChanged(f) }
                )
            }
        }

        HorizontalDivider(color = palette.divider)

        // Content
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(2.dp),
            contentPadding = PaddingValues(start = 8.dp, end = 8.dp, top = 4.dp, bottom = 96.dp),
        ) {
            when (filter) {
                InboxFilter.Messages -> {
                    items(dmThreads) { thread ->
                        DmRow(
                            thread = thread,
                            isSelected = thread.id == selectedThreadId,
                            onSelected = { onThreadSelected(thread.id) }
                        )
                    }
                }
                InboxFilter.Groups -> {
                    items(groupChats) { group ->
                        GroupRow(
                            group = group,
                            onSelected = { onGroupSelected(group) }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun FilterTab(
    label: String,
    isSelected: Boolean,
    onSelected: () -> Unit,
) {
    val palette = LocalPalette.current
    Box(
        modifier = Modifier
            .padding(horizontal = 12.dp, vertical = 8.dp)
            .background(
                if (isSelected) palette.accent.copy(alpha = 0.15f) else Color.Transparent,
                shape = RoundedCornerShape(16.dp),
            ),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            color = if (isSelected) palette.accent else palette.textMuted,
            fontSize = 13.sp,
            fontWeight = androidx.compose.ui.text.font.FontWeight.Medium,
        )
    }
}

@Composable
private fun DmRow(
    thread: DmThread,
    isSelected: Boolean,
    onSelected: () -> Unit,
) {
    val palette = LocalPalette.current
    val friend = thread.friend
    val name = friend?.name ?: "Unknown"
    val preview = thread.lastMessagePreview ?: ""

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(if (isSelected) palette.accent.copy(alpha = 0.08f) else Color.Transparent)
            .clickable(onClick = onSelected)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AvatarImage(url = friend?.avatarUrl, name = name, size = 44.dp)
        Spacer(modifier = Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = name,
                color = palette.textPrimary,
                fontSize = 15.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Medium,
            )
            if (preview.isNotBlank()) {
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = preview,
                    color = palette.textMuted,
                    fontSize = 13.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
private fun GroupRow(
    group: GroupChat,
    onSelected: () -> Unit,
) {
    val palette = LocalPalette.current
    val memberCount = group.members?.size ?: 0

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .clickable(onClick = onSelected)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AvatarImage(url = group.iconUrl, name = group.name, size = 44.dp)
        Spacer(modifier = Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(text = group.name, color = palette.textPrimary, fontSize = 15.sp)
            Spacer(modifier = Modifier.height(2.dp))
            Text(text = "$memberCount members", color = palette.textMuted, fontSize = 13.sp)
        }
    }
}
