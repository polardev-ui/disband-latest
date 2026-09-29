package com.wsgpolar.disband.ui.main

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.setValue
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.data.Channel
import com.wsgpolar.disband.data.ChannelCategory
import com.wsgpolar.disband.data.ChannelType
import com.wsgpolar.disband.data.DmThread
import com.wsgpolar.disband.data.GroupChat
import com.wsgpolar.disband.data.Server
import com.wsgpolar.disband.data.Database
import com.wsgpolar.disband.state.AppState
import com.wsgpolar.disband.ui.chat.DmChatScreen
import com.wsgpolar.disband.ui.chat.GroupChatScreen
import com.wsgpolar.disband.ui.calls.CallOverlay
import com.wsgpolar.disband.ui.calls.VoiceStageView
import com.wsgpolar.disband.ui.collectAsStateValue
import androidx.compose.runtime.rememberCoroutineScope
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch

@Composable
fun MainScreen(
    app: AppState,
    modifier: Modifier = Modifier,
    /** Deep link from a notification tap; applied once, then reported consumed. */
    pendingNav: PendingNav? = null,
    onPendingNavConsumed: () -> Unit = {},
) {
    /*
     Invite, Members and the ⋯ menu used to be PARAMETERS of this composable,
     each defaulting to `{}`, under a comment calling them "wiring hooks for
     later agents". The one call site — AppRoot — passed none of them, so
     every one of those buttons ran an empty lambda: nothing on screen, no
     crash, no log, and nothing for the compiler to complain about.

     They are owned here now. This screen already has `app`, which is
     everything the sheets need, so there was never a reason for the caller to
     supply them — and a required callback that defaults to `{}` is exactly
     how a dead button survives a compile and a review.
    */
    var inviteFor by remember { mutableStateOf<Server?>(null) }
    var membersFor by remember { mutableStateOf<Server?>(null) }
    var overflowFor by remember { mutableStateOf<Server?>(null) }
    val shellChrome = remember { ShellChromeState() }
    val currentUserId = app.currentUserId
    // `app.servers.value` read the flow ONCE at composition and never
    // subscribed, so Compose never learned when loadServers() finished. The
    // rail stayed empty until something unrelated forced a recomposition —
    // which is why spaces looked like they took forever to load, or simply
    // never appeared after a cold start. They were loading fine; the screen
    // was not listening.
    val servers by app.servers.collectAsStateValue()
    val palette = LocalPalette.current

    var allChannels by remember { mutableStateOf<List<Channel>>(emptyList()) }
    var allCategories by remember { mutableStateOf<List<ChannelCategory>>(emptyList()) }
    var dmThreads by remember { mutableStateOf<List<DmThread>>(emptyList()) }
    var groupChats by remember { mutableStateOf<List<GroupChat>>(emptyList()) }

    val scope = rememberCoroutineScope()

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

    // --- Notification deep link: route once, then tell the caller it's done. ---
    LaunchedEffect(pendingNav) {
        if (pendingNav == null || pendingNav.isBlank) return@LaunchedEffect

        // A raw push source has to be identified before it can be opened:
        // it is a bare uuid, and a channel, a DM thread and a group all look
        // the same. Anything already resolved goes straight through.
        val resolved = pendingNav.source?.let { raw ->
            when (val answer = Database.resolveNotificationSource(raw)) {
                null -> null
                else -> when (answer.kind) {
                    "channel" -> PendingNav(serverId = answer.serverId, channelId = answer.id)
                    "dm", "group" -> PendingNav(threadId = answer.id)
                    // A friend request has no conversation to open, and an
                    // unreadable source is not ours to guess at.
                    else -> null
                }
            }
        } ?: pendingNav.takeIf { it.source == null }

        if (resolved != null) shellChrome.applyPending(resolved)
        onPendingNavConsumed()
    }

    val selectedChannelId = shellChrome.selectedChannelId
    val selectedServerId = shellChrome.selectedServerId
    val hasChatOpen = selectedChannelId != null

    // The dock hides for an open conversation AND while the keyboard is up
    // (filters, note editors, ...), matching iOS.
    val imeVisible = WindowInsets.ime.getBottom(LocalDensity.current) > 0
    val dockBlocked = hasChatOpen || imeVisible
    LaunchedEffect(dockBlocked) {
        if (dockBlocked) shellChrome.hideDock() else shellChrome.showDock()
    }

    // Dock badge: total unread across DM threads and group chats.
    val dmUnreadMap by app.dmUnread.unread.collectAsStateValue()
    val groupUnreadMap by app.dmUnread.groupUnread.collectAsStateValue()
    val homeBadge = dmUnreadMap.values.sum() + groupUnreadMap.values.sum()

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
            /*
             Switch tab as well as thread.

             Setting `selectedChannelId` alone opened the conversation while
             the Friends tab was still the visible destination — the chat
             screen called hidesDock(), so the dock disappeared and the friend
             list stayed on screen looking broken, with the DM rendered
             underneath where nobody could see it. Tapping the message button
             on a friend simply appeared to do nothing.

             `navigateTo` moves to Home with no server selected, which is the
             inbox, and points it at the thread.
            */
            shellChrome.navigateTo(Destination.Home, serverId = null, channelId = threadId)
        }
    }

    Box(modifier.fillMaxSize()) {
        // Every destination sits under the status bar otherwise — the clock and
        // the notch were landing on top of headers. Applied once here rather
        // than repeated in each screen, so they cannot disagree.
        //
        // All four destinations stay composed: the inactive ones are simply
        // faded out and layered behind the active one, so scroll positions and
        // in-place navigation state survive tab switches, like iOS's kept-alive
        // shell views.
        Box(Modifier.fillMaxSize().statusBarsPadding()) {
            Destination.entries.forEach { destination ->
                val isActive = shellChrome.currentDestination == destination
                Box(
                    Modifier
                        .fillMaxSize()
                        .zIndex(if (isActive) 1f else 0f)
                        .alpha(if (isActive) 1f else 0f)
                        .background(palette.background)
                        // Backgrounds do not intercept touches in Compose, so
                        // the active layer also carries an empty pointer-input
                        // filter: it swallows taps/scrolls that fall between
                        // its children so they never reach the kept-alive
                        // screens layered behind it.
                        .let { if (isActive) it.pointerInput(destination) { } else it },
                ) {
                    when (destination) {
                        Destination.Friends -> FriendsScreen(
                            app = app,
                            onOpenDm = ::openDmThread,
                        )
                        Destination.Notes -> NotesScreen(app)
                        Destination.You -> YouScreen(app)
                        Destination.Home -> SpacesView(
                            app = app,
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
                            onInvite = { inviteFor = it },
                            onMembers = { membersFor = it },
                            onOverflow = { overflowFor = it },
                            // Still unwired, but deliberately left as the
                            // panel's own defaults rather than dead params
                            // here: server unread counts and live voice
                            // occupants have no source on Android yet.
                            
                        )
                    }
                }
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
        // whenever a conversation takes the screen or the keyboard appears. It
        // floats: a ~6dp inset above the navigation bar, not edge-attached.
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
                homeBadge = homeBadge,
                modifier = Modifier
                    .navigationBarsPadding()
                    .padding(bottom = 6.dp)
                    .background(Color.Transparent),
            )
        }

        CallOverlay(app, shellChrome = shellChrome)
    }

    // The three sheets the space header opens.
    inviteFor?.let { server ->
        InviteSheet(server = server, onDismiss = { inviteFor = null })
    }
    membersFor?.let { server ->
        MembersSheet(server = server, onDismiss = { membersFor = null })
    }
    overflowFor?.let { server ->
        ServerOverflowSheet(
            app = app,
            server = server,
            onDismiss = { overflowFor = null },
            // Leaving a space you are looking at has to put you somewhere
            // else, or the panel renders a server you are no longer in.
            onLeft = { shellChrome.selectedServerId = null },
        )
    }
}
