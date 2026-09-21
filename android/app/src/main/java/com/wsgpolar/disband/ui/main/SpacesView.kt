package com.wsgpolar.disband.ui.main

import androidx.compose.foundation.layout.*
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.wsgpolar.disband.data.Channel
import com.wsgpolar.disband.data.ChannelCategory
import com.wsgpolar.disband.data.DmThread
import com.wsgpolar.disband.data.GroupChat
import com.wsgpolar.disband.data.Server
import com.wsgpolar.disband.ui.main.InboxFilter

@Composable
fun SpacesView(
    state: ShellChromeState,
    servers: List<Server>,
    categories: List<ChannelCategory>,
    channels: List<Channel>,
    dmThreads: List<DmThread>,
    groupChats: List<GroupChat>,
    onServerSelected: (Server) -> Unit,
    onChannelSelected: (Channel) -> Unit,
    onThreadSelected: (String) -> Unit,
    onGroupSelected: (GroupChat) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.fillMaxSize(),
    ) {
        ServerRail(
            servers = servers,
            selectedServerId = state.selectedServerId,
            onServerSelected = onServerSelected,
            onInboxSelected = { state.navigateTo(Destination.Home) },
        )

        VerticalDivider(thickness = 1.dp)

        // Right panel — weight so it takes whatever the rail leaves, rather
        // than measuring at its own intrinsic width.
        Box(Modifier.weight(1f).fillMaxHeight()) {
        when {
            state.selectedServerId != null -> {
                ChannelPanel(
                    categories = categories.filter { it.serverId == state.selectedServerId },
                    channels = channels.filter { it.serverId == state.selectedServerId },
                    selectedChannelId = state.selectedChannelId,
                    onChannelSelected = { channel ->
                        state.selectedChannelId = channel.id
                        onChannelSelected(channel)
                    },
                )
            }
            else -> {
                val currentFilter = remember { mutableStateOf(InboxFilter.Messages) }
                InboxPanel(
                    dmThreads = dmThreads,
                    groupChats = groupChats,
                    selectedThreadId = state.selectedChannelId,
                    onThreadSelected = { id ->
                        state.selectedChannelId = id
                        onThreadSelected(id)
                    },
                    onGroupSelected = onGroupSelected,
                    filter = currentFilter.value,
                    onFilterChanged = { currentFilter.value = it },
                )
            }
        }
        }
    }
}
