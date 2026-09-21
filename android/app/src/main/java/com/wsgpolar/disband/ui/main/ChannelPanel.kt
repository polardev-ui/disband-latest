package com.wsgpolar.disband.ui.main

import androidx.compose.foundation.clickable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.items
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.data.Channel
import com.wsgpolar.disband.data.ChannelCategory
import com.wsgpolar.disband.data.ChannelType
import com.wsgpolar.disband.ui.AvatarImage

@Composable
fun ChannelPanel(
    categories: List<ChannelCategory>,
    channels: List<Channel>,
    selectedChannelId: String?,
    onChannelSelected: (Channel) -> Unit,
    modifier: Modifier = Modifier,
) {
    val palette = LocalPalette.current

    // Channels that belong to no category are perfectly normal and used to be
    // invisible: the list only walked categories, so a server whose channels
    // were all uncategorised looked empty.
    val uncategorised = channels.filter { it.categoryId == null }.sortedBy { it.position }
    val orderedCategories = categories.sortedBy { it.position }

    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .background(palette.background),
        verticalArrangement = Arrangement.spacedBy(2.dp),
        contentPadding = PaddingValues(start = 8.dp, end = 8.dp, top = 8.dp, bottom = 96.dp),
    ) {
        items(uncategorised, key = { it.id }) { channel ->
            ChannelRow(
                channel = channel,
                isSelected = channel.id == selectedChannelId,
                onSelected = { onChannelSelected(channel) },
            )
        }

        orderedCategories.forEach { category ->
            val inside = channels.inCategory(category)
            if (inside.isEmpty()) return@forEach
            item(key = "cat-${category.id}") {
                CategoryHeader(category = category)
                HorizontalDivider(color = palette.divider)
            }
            items(inside, key = { it.id }) { channel ->
                ChannelRow(
                    channel = channel,
                    isSelected = channel.id == selectedChannelId,
                    onSelected = { onChannelSelected(channel) },
                )
            }
        }
    }
}

@Composable
private fun CategoryHeader(category: ChannelCategory) {
    val palette = LocalPalette.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 12.dp, top = 6.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = category.name,
            color = palette.textMuted,
            fontSize = 12.sp,
            fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold,
        )
    }
}

@Composable
private fun ChannelRow(
    channel: Channel,
    isSelected: Boolean,
    onSelected: () -> Unit,
) {
    val palette = LocalPalette.current
    val isVoice = channel.type == ChannelType.Voice

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp, vertical = 4.dp)
            .background(
                if (isSelected) palette.accent.copy(alpha = 0.1f) else Color.Transparent,
                shape = RoundedCornerShape(6.dp),
            )
            .clickable(onClick = onSelected),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (isVoice) {
            Icon(
                imageVector = androidx.compose.material.icons.Icons.Filled.VolumeUp,
                contentDescription = null,
                tint = palette.textMuted,
                modifier = Modifier.size(20.dp),
            )
        } else {
            Icon(
                imageVector = androidx.compose.material.icons.Icons.AutoMirrored.Filled.Chat,
                contentDescription = null,
                tint = palette.textMuted,
                modifier = Modifier.size(20.dp),
            )
        }
        Spacer(modifier = Modifier.width(8.dp))
        Text(
            text = "#${channel.name}",
            color = if (isSelected) palette.accent else palette.textPrimary,
            fontSize = 14.sp,
            fontWeight = if (isSelected) androidx.compose.ui.text.font.FontWeight.SemiBold else androidx.compose.ui.text.font.FontWeight.Normal,
        )
    }
}

private fun List<Channel>.inCategory(category: ChannelCategory): List<Channel> {
    return this.filter { it.categoryId == category.id }.sortedBy { it.position }
}
