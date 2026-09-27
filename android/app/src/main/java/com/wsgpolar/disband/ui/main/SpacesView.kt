package com.wsgpolar.disband.ui.main

import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.core.Radii
import com.wsgpolar.disband.data.Channel
import com.wsgpolar.disband.data.ChannelCategory
import com.wsgpolar.disband.data.DmThread
import com.wsgpolar.disband.data.GroupChat
import com.wsgpolar.disband.data.Server
import com.wsgpolar.disband.data.UserStatus
import com.wsgpolar.disband.state.AppState
import com.wsgpolar.disband.ui.collectAsStateValue

/**
 * Home: the server rail on the background colour with the panel sitting on
 * surface behind a top-leading-only 28dp corner — the uneven rounding iOS
 * uses. The panel content cross-fades between the inbox and a server's
 * channels.
 */
@Composable
fun SpacesView(
    app: AppState,
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
    onInvite: (Server) -> Unit = {},
    onMembers: (Server) -> Unit = {},
    onOverflow: (Server) -> Unit = {},
    unreadForServer: (String) -> Int = { 0 },
    occupantsFor: (Channel) -> List<VoiceOccupant> = { emptyList() },
    onAddServer: () -> Unit = {},
    onExplore: () -> Unit = {},
) {
    val palette = LocalPalette.current
    // Collect the presence StateFlow once so every status read below is live —
    // reading PresenceService.status() per row snapshots a stale map.
    val statuses by app.presence.statuses.collectAsStateValue()
    val selfStatus = app.currentUserId?.let { statuses[it] } ?: UserStatus.Offline

    Row(
        modifier = modifier.fillMaxSize(),
    ) {
        ServerRail(
            servers = servers,
            selectedServerId = state.selectedServerId,
            onServerSelected = onServerSelected,
            onInboxSelected = { state.navigateTo(Destination.Home) },
            selfStatus = selfStatus,
            unreadForServer = unreadForServer,
            onAddServer = onAddServer,
            onExplore = onExplore,
        )

        // Right panel — weight so it takes whatever the rail leaves. The
        // surface fill sits on this container so the top-leading clip shows.
        Box(
            Modifier
                .weight(1f)
                .fillMaxHeight()
                .clip(RoundedCornerShape(topStart = Radii.panelTopLeading))
                .background(palette.surface),
        ) {
            Crossfade(
                targetState = state.selectedServerId,
                animationSpec = tween(220),
                label = "panelContent",
            ) { serverId ->
                if (serverId != null) {
                    ChannelPanel(
                        server = servers.firstOrNull { it.id == serverId },
                        categories = categories.filter { it.serverId == serverId },
                        channels = channels.filter { it.serverId == serverId },
                        selectedChannelId = state.selectedChannelId,
                        onChannelSelected = { channel ->
                            state.selectedChannelId = channel.id
                            onChannelSelected(channel)
                        },
                        onInvite = { servers.firstOrNull { it.id == serverId }?.let(onInvite) },
                        onMembers = { servers.firstOrNull { it.id == serverId }?.let(onMembers) },
                        onOverflow = { servers.firstOrNull { it.id == serverId }?.let(onOverflow) },
                        occupantsFor = occupantsFor,
                    )
                } else {
                    val currentFilter = remember { mutableStateOf(InboxFilter.All) }
                    val unread by app.dmUnread.unread.collectAsStateValue()
                    val groupUnread by app.dmUnread.groupUnread.collectAsStateValue()
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
                        statusOf = { id -> statuses[id] ?: UserStatus.Offline },
                        unreadForThread = { unread[it] ?: 0 },
                        unreadForGroup = { groupUnread[it] ?: 0 },
                        onCompose = { state.navigateTo(Destination.Friends) },
                    )
                }
            }
        }
    }
}
