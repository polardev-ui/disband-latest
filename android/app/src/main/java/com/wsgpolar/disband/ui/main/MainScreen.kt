package com.wsgpolar.disband.ui.main

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.Alignment
import androidx.compose.ui.unit.dp
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.setValue
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import com.wsgpolar.disband.data.Channel
import com.wsgpolar.disband.data.ChannelCategory
import com.wsgpolar.disband.data.ChannelType
import com.wsgpolar.disband.data.DmThread
import com.wsgpolar.disband.data.GroupChat
import com.wsgpolar.disband.data.Database
import com.wsgpolar.disband.state.AppState
import com.wsgpolar.disband.ui.chat.DmChatScreen
import com.wsgpolar.disband.ui.chat.GroupChatScreen
import com.wsgpolar.disband.ui.calls.CallOverlay
import com.wsgpolar.disband.ui.calls.VoiceStageView
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

@Composable
fun MainScreen(app: AppState) {
    val shellChrome = remember { ShellChromeState() }
    val currentUserId = app.currentUserId
    val servers = app.servers.value

    var allChannels by remember { mutableStateOf<List<Channel>>(emptyList()) }
    var allCategories by remember { mutableStateOf<List<ChannelCategory>>(emptyList()) }
    var dmThreads by remember { mutableStateOf<List<DmThread>>(emptyList()) }
    var groupChats by remember { mutableStateOf<List<GroupChat>>(emptyList()) }

    val scope = remember { CoroutineScope(Dispatchers.Main) }

    // Loading used to be one long chain: two round-trips per server, one server
    // at a time, and only then the DMs — so with a dozen spaces the inbox, which
    // is what Home actually shows first, waited on two dozen sequential
    // requests. Now the DMs and groups go out immediately alongside every
    // server's channels in parallel, and each result lands as it arrives.
    LaunchedEffect(currentUserId, servers.map { it.id }.joinToString(",")) {
        if (currentUserId == null) return@LaunchedEffect

        launch {
            dmThreads = runCatching { Database.myDmThreads(currentUserId) }.getOrDefault(emptyList())
        }
        launch {
            groupChats = runCatching { Database.myGroups(currentUserId) }.getOrDefault(emptyList())
        }
        launch {
            coroutineScope {
                val channelJobs = servers.map { server ->
                    async { runCatching { Database.channels(server.id) }.getOrDefault(emptyList()) }
                }
                val categoryJobs = servers.map { server ->
                    async { runCatching { Database.categories(server.id) }.getOrDefault(emptyList()) }
                }
                allChannels = channelJobs.awaitAll().flatten()
                allCategories = categoryJobs.awaitAll().flatten()
            }
        }
    }

    val selectedChannelId = shellChrome.selectedChannelId
    val selectedServerId = shellChrome.selectedServerId
    val hasChatOpen = selectedChannelId != null

    LaunchedEffect(hasChatOpen) {
        if (hasChatOpen) shellChrome.hideDock() else shellChrome.showDock()
    }

    val openChannel = allChannels.firstOrNull { it.id == selectedChannelId && it.serverId == selectedServerId }
    val openGroup = groupChats.firstOrNull { it.id == selectedChannelId }
    val openDm = dmThreads.firstOrNull { it.id == selectedChannelId }

    /**
     * Resolve a friend to a DM thread, make sure the thread is actually in
     * `dmThreads` — the overlay below finds the open chat by looking it up
     * there — and only then point the shell at it. Selecting first would land
     * on a thread the lookup cannot see, and show nothing.
     */
    fun openDmThread(threadId: String) {
        scope.launch {
            if (currentUserId != null && dmThreads.none { it.id == threadId }) {
                dmThreads = runCatching { Database.myDmThreads(currentUserId) }
                    .getOrDefault(dmThreads)
            }
            shellChrome.selectedChannelId = threadId
        }
    }

    Box(Modifier.fillMaxSize()) {
        // Every destination sits under the status bar otherwise — the clock and
        // the notch were landing on top of headers. Applied once here rather
        // than repeated in each screen, so they cannot disagree.
        Box(Modifier.fillMaxSize().statusBarsPadding()) {
        when (shellChrome.currentDestination) {
            Destination.Friends -> FriendsScreen(
                app = app,
                onOpenDm = ::openDmThread,
            )
            Destination.Notes -> NotesScreen(app)
            Destination.You -> YouScreen(app)
            Destination.Home -> SpacesView(
            state = shellChrome,
            servers = servers,
            categories = allCategories,
            channels = allChannels,
            dmThreads = dmThreads,
            groupChats = groupChats,
            onServerSelected = { server ->
                shellChrome.navigateTo(Destination.Home, server.id)
            },
            onChannelSelected = { channel ->
                shellChrome.selectedChannelId = channel.id
            },
            onThreadSelected = { id ->
                shellChrome.selectedChannelId = id
            },
            onGroupSelected = { group ->
                shellChrome.selectedChannelId = group.id
            },
            )
        }
        }

        if (openChannel != null && currentUserId != null) {
            val server = servers.firstOrNull { it.id == openChannel.serverId }
            if (openChannel.type == ChannelType.Voice) {
                VoiceStageView(
                    app = app,
                    channel = openChannel,
                    onMinimize = { shellChrome.selectedChannelId = null },
                    onBack = { shellChrome.selectedChannelId = null },
                )
            } else {
                com.wsgpolar.disband.ui.chat.ChannelChatScreen(
                    app = app,
                    channel = openChannel,
                    serverName = server?.name ?: "",
                    onBack = { shellChrome.selectedChannelId = null },
                )
            }
        } else if (openDm != null && currentUserId != null) {
            val friend = openDm.friend
            if (friend != null) {
                DmChatScreen(
                    app = app,
                    thread = openDm,
                    onBack = { shellChrome.selectedChannelId = null },
                )
            }
        } else if (openGroup != null && currentUserId != null) {
            GroupChatScreen(
                app = app,
                group = openGroup,
                onBack = { shellChrome.selectedChannelId = null },
            )
        }

        // The dock sits above the shell but below an open chat, and slides away
        // whenever a conversation takes the screen.
        AnimatedVisibility(
            visible = shellChrome.dockVisible,
            enter = slideInVertically { it } + fadeIn(),
            exit = slideOutVertically { it } + fadeOut(),
            modifier = Modifier.align(Alignment.BottomCenter),
        ) {
            FloatingDock(
                state = shellChrome,
                onDestinationSelected = { destination ->
                    shellChrome.navigateTo(destination)
                },
                modifier = Modifier.navigationBarsPadding().padding(bottom = 12.dp),
            )
        }

        CallOverlay(app, shellChrome = shellChrome)
    }
}
