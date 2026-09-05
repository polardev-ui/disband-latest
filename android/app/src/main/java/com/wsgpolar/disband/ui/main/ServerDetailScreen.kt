package com.wsgpolar.disband.ui.main

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.Tag
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.core.Palette
import com.wsgpolar.disband.data.Channel
import com.wsgpolar.disband.data.ChannelCategory
import com.wsgpolar.disband.data.ChannelType
import com.wsgpolar.disband.data.Database
import com.wsgpolar.disband.data.Server
import com.wsgpolar.disband.state.AppState
import com.wsgpolar.disband.ui.AvatarImage
import com.wsgpolar.disband.ui.chat.ChannelChatScreen

@Composable
fun ServerDetailScreen(app: AppState, server: Server, onBack: () -> Unit) {
    val uid = app.currentUserId ?: return
    val palette = LocalPalette.current

    var channels by remember(server.id) { mutableStateOf<List<Channel>>(emptyList()) }
    var categories by remember(server.id) { mutableStateOf<List<ChannelCategory>>(emptyList()) }
    var memberCount by remember(server.id) { mutableStateOf<Int?>(null) }
    var loading by remember(server.id) { mutableStateOf(true) }

    var openChannel by remember { mutableStateOf<Channel?>(null) }
    var openVoice by remember { mutableStateOf<Channel?>(null) }

    LaunchedEffect(server.id) {
        loading = true
        channels = runCatching { Database.channels(server.id) }.getOrDefault(emptyList())
        categories = runCatching { Database.categories(server.id) }.getOrDefault(emptyList())
        memberCount = runCatching { Database.members(server.id) }.getOrNull()?.size
        loading = false
    }

    openChannel?.let { channel ->
        ChannelChatScreen(app = app, channel = channel, serverName = server.name,
            onBack = { openChannel = null })
        return
    }
    openVoice?.let { channel ->
        VoiceChannelScreen(app = app, channel = channel, onBack = { openVoice = null })
        return
    }

    Column(Modifier.fillMaxSize().background(palette.background)) {
        ServerTopBar(palette = palette, server = server, memberCount = memberCount, onBack = onBack)
        HorizontalDivider(color = palette.divider)
        when {
            loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = palette.accent)
            }
            else -> {
                val uncategorized = channels.filter { it.categoryId == null }
                val grouped = categories.map { category ->
                    category to channels.filter { it.categoryId == category.id }
                }
                LazyColumn(Modifier.fillMaxSize()) {
                    if (uncategorized.isNotEmpty()) {
                        item { CategoryLabel("Text Channels", palette) }
                        items(uncategorized) { channel ->
                            ChannelRow(channel = channel, palette = palette,
                                onOpen = {
                                    if (channel.type == ChannelType.Text) openChannel = channel
                                    else openVoice = channel
                                })
                        }
                    }
                    grouped.forEach { (category, channelList) ->
                        if (channelList.isNotEmpty()) {
                            item { CategoryLabel(category.name, palette) }
                            items(channelList) { channel ->
                                ChannelRow(channel = channel, palette = palette,
                                    onOpen = {
                                        if (channel.type == ChannelType.Text) openChannel = channel
                                        else openVoice = channel
                                    })
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ServerTopBar(
    palette: Palette,
    server: Server,
    memberCount: Int?,
    onBack: () -> Unit,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .background(palette.surface)
            .statusBarsPadding()
            .height(56.dp)
            .padding(horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onBack) {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back",
                tint = palette.textPrimary)
        }
        AvatarImage(url = server.iconUrl, name = server.name, size = 36.dp)
        Column(Modifier.padding(start = 10.dp).weight(1f)) {
            Text(server.name, color = palette.textPrimary, fontSize = 16.sp,
                fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            memberCount?.let {
                Text("$it members", color = palette.textMuted, fontSize = 12.sp)
            }
        }
    }
}

@Composable
private fun CategoryLabel(label: String, palette: Palette) {
    Text(
        label.uppercase(),
        color = palette.textMuted,
        fontSize = 11.sp,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.padding(start = 16.dp, top = 14.dp, bottom = 4.dp),
    )
}

@Composable
private fun ChannelRow(channel: Channel, palette: Palette, onOpen: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onOpen).padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            if (channel.type == ChannelType.Voice) Icons.Filled.GraphicEq else Icons.Filled.Tag,
            contentDescription = null,
            tint = palette.textMuted,
            modifier = Modifier.size(20.dp),
        )
        Text(
            "  ${if (channel.type == ChannelType.Text) "#" else ""}${channel.name}",
            color = palette.textSecondary,
            fontSize = 15.sp,
            modifier = Modifier.weight(1f),
        )
        if (channel.type == ChannelType.Voice) {
            Text("Voice", color = palette.accent, fontSize = 12.sp)
        }
    }
    HorizontalDivider(color = palette.divider, modifier = Modifier.padding(start = 52.dp))
}