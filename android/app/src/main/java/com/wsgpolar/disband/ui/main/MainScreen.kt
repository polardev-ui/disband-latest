package com.wsgpolar.disband.ui.main

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import androidx.compose.animation.togetherWith
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.key
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.graphics.graphicsLayer
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.setValue
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.core.leave
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
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.merge
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
    var settingsFor by remember { mutableStateOf<Server?>(null) }
    var showAddSpace by remember { mutableStateOf(false) }
    var showDiscover by remember { mutableStateOf(false) }
    var inviteToJoin by remember { mutableStateOf<String?>(null) }
    AskForNotificationsOnce()
    val shellChrome = rememberShellChrome()
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
    var inboxLoading by remember { mutableStateOf(true) }
    var inboxError by remember { mutableStateOf<String?>(null) }
    var spaceLoading by remember { mutableStateOf(false) }
    var spaceError by remember { mutableStateOf<String?>(null) }
    var retryVersion by remember { mutableStateOf(0) }

    suspend fun refreshInbox() {
        val uid = currentUserId ?: return
        inboxLoading = true
        try {
            coroutineScope {
                val threads = async { Database.myDmThreads(uid) }
                val groups = async { Database.myGroups(uid) }
                // The unread maps used to be seeded once at sign-in and never
                // again, so every dot, bold row, Unread filter and dock badge
                // stayed frozen at their launch-time values.
                val dmCounts = async { runCatching { Database.unreadDmCounts() }.getOrNull() }
                val groupCounts = async { runCatching { Database.unreadGroupCounts() }.getOrNull() }
                dmThreads = threads.await()
                groupChats = groups.await()
                dmCounts.await()?.let { rows ->
                    app.dmUnread.seedUnread(rows.associate { it.threadId to it.unreadCount })
                }
                groupCounts.await()?.let { rows ->
                    app.dmUnread.seedGroupUnread(rows.associate { it.groupId to it.unreadCount })
                }
                inboxError = null
            }
        } catch (e: kotlinx.coroutines.CancellationException) { throw e }
        catch (e: Exception) {
            android.util.Log.e("Disband", "refreshInbox failed", e)
            inboxError = "Couldn't refresh conversations. Try again."
        }
        finally { inboxLoading = false }
    }

    // Load the visible space on demand. Opening Messages no longer downloads
    // every channel/category in every space the account belongs to.
    val loadedSpaces = remember(currentUserId) { mutableSetOf<String>() }
    LaunchedEffect(currentUserId, shellChrome.selectedServerId, retryVersion) {
        spaceError = null
        spaceLoading = false
        val id = shellChrome.selectedServerId ?: return@LaunchedEffect
        if (id in loadedSpaces) return@LaunchedEffect
        spaceLoading = true
        try {
            coroutineScope {
                val channels = async { Database.channels(id) }
                val categories = async { Database.categories(id) }
                allChannels = allChannels.filterNot { it.serverId == id } + channels.await()
                allCategories = allCategories.filterNot { it.serverId == id } + categories.await()
                loadedSpaces.add(id)
            }
        } catch (e: kotlinx.coroutines.CancellationException) { throw e }
        catch (_: Exception) { spaceError = "Couldn't load this space. Try again." }
        finally { spaceLoading = false }
    }

    // --- Notification deep link: route once, then tell the caller it's done. ---
    LaunchedEffect(pendingNav) {
        if (pendingNav == null || pendingNav.isBlank) return@LaunchedEffect

        pendingNav.inviteCode?.let { code ->
            inviteToJoin = code
            onPendingNavConsumed()
            return@LaunchedEffect
        }

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
    val lifecycle = androidx.lifecycle.compose.LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(currentUserId, hasChatOpen, homeBadge, lifecycle, retryVersion) {
        lifecycle.repeatOnLifecycle(androidx.lifecycle.Lifecycle.State.STARTED) {
            // Refresh on resume, unread changes and returning from a chat.
            // Preserve the visible inbox on a failed request.
            refreshInbox()
        }
    }

    // Keep the inbox live while it is on screen. The old screen loaded once
    // and only refreshed on resume, so a message arriving in front of you did
    // not reorder the list, update its preview or raise an unread count.
    LaunchedEffect(currentUserId, lifecycle) {
        if (currentUserId == null) return@LaunchedEffect
        lifecycle.repeatOnLifecycle(androidx.lifecycle.Lifecycle.State.STARTED) {
            val dmLive = try {
                com.wsgpolar.disband.data.RealtimeService.observeChanges("dm_messages")
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (_: Exception) {
                null
            }
            val groupLive = try {
                com.wsgpolar.disband.data.RealtimeService.observeChanges("group_messages")
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (_: Exception) {
                null
            }
            try {
                val flows = listOfNotNull(dmLive?.flow, groupLive?.flow)
                if (flows.isNotEmpty()) {
                    merge(*flows.toTypedArray()).collectLatest {
                        // A burst of messages is one inbox refresh.
                        delay(350)
                        refreshInbox()
                    }
                }
            } finally {
                // The effect is cancelled whenever the screen stops, so the
                // unsubscribe must not inherit that cancellation or the
                // channels are left subscribed for the next screen.
                kotlinx.coroutines.withContext(kotlinx.coroutines.NonCancellable) {
                    runCatching { dmLive?.channel?.leave() }
                    runCatching { groupLive?.channel?.leave() }
                }
            }
        }
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

    fun openNotificationSource(source: String) {
        scope.launch {
            // Notification inbox rows store "channel:<uuid>" / "dm:<uuid>" /
            // "/group/<uuid>"; push payloads store a bare uuid. The resolver
            // only understands the bare id, so drop the kind hint first.
            val raw = notificationSourceId(source)
            val resolved = when (val answer = Database.resolveNotificationSource(raw)) {
                null -> null
                else -> when (answer.kind) {
                    "channel" -> PendingNav(serverId = answer.serverId, channelId = answer.id)
                    "dm", "group" -> PendingNav(threadId = answer.id)
                    else -> null
                }
            }
            if (resolved != null) shellChrome.applyPending(resolved)
        }
    }

    val visited = remember { mutableStateListOf(Destination.Home) }
    SideEffect { if (shellChrome.currentDestination !in visited) visited.add(shellChrome.currentDestination) }
    val chatStates = rememberSaveableStateHolder()
    val route = selectedChannelId?.let {
        OpenConversation(it, openChannel, openDm, openGroup,
            servers.firstOrNull { server -> server.id == selectedServerId }?.name.orEmpty())
    }

    Box(modifier.fillMaxSize().background(palette.background)) {
        // Every destination sits under the status bar otherwise — the clock and
        // the notch were landing on top of headers. Applied once here rather
        // than repeated in each screen, so they cannot disagree.
        //
        // Compose each tab on its first visit and retain its state afterwards.
        // Inactive tabs are not measured, drawn, or exposed to accessibility.
        Box(Modifier.fillMaxSize().statusBarsPadding()) {
            Destination.entries.filter { it in visited || it == shellChrome.currentDestination }.forEach { destination ->
                key(destination) {
                val isActive = shellChrome.currentDestination == destination
                val opacity by animateFloatAsState(if (isActive) 1f else 0f,
                    animationSpec = tween(160), label = "destination")
                Layout(
                    modifier = Modifier.fillMaxSize()
                        .then(if (!isActive || hasChatOpen) Modifier.clearAndSetSemantics {} else Modifier)
                        .graphicsLayer { alpha = opacity },
                    content = {
                    when (destination) {
                        Destination.Friends -> FriendsScreen(
                            app = app,
                            onOpenDm = ::openDmThread,
                        )
                        Destination.Notes -> NotesScreen(app)
                        Destination.You -> YouScreen(app, onOpenNotification = ::openNotificationSource)
                        Destination.Home -> SpacesView(
                            app = app,
                            state = shellChrome,
                            servers = servers,
                            categories = allCategories,
                            channels = allChannels,
                            dmThreads = dmThreads,
                            groupChats = groupChats,
                            loading = if (selectedServerId == null) inboxLoading else spaceLoading,
                            loadError = if (selectedServerId == null) inboxError else spaceError,
                            onRetry = { retryVersion++ },
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
                            onAddServer = { showAddSpace = true },
                            onExplore = { showDiscover = true },
                            // Still unwired, but deliberately left as the
                            // panel's own defaults rather than dead params
                            // here: server unread counts and live voice
                            // occupants have no source on Android yet.
                            
                        )
                    }
                    },
                ) { measurables, constraints ->
                    if (isActive) {
                        val placeables = measurables.map { it.measure(constraints) }
                        layout(constraints.maxWidth, constraints.maxHeight) { placeables.forEach { it.place(0, 0) } }
                    } else layout(0, 0) {}
                }
                }
            }
        }

        AnimatedContent(
            targetState = route,
            contentKey = { it?.id },
            transitionSpec = {
                if (targetState != null) {
                    (slideInHorizontally(tween(280)) { it / 5 } + fadeIn(tween(180))) togetherWith fadeOut(tween(120))
                } else {
                    fadeIn(tween(100)) togetherWith (slideOutHorizontally(tween(240)) { it / 4 } + fadeOut(tween(180)))
                }
            },
            label = "conversationNavigation",
        ) { destination ->
            if (destination != null && currentUserId != null) {
                chatStates.SaveableStateProvider(destination.id) {
                    val close = { shellChrome.selectedChannelId = null }
                    when {
                        destination.channel != null -> {
                            val channel = destination.channel
                            if (channel.type == ChannelType.Voice) VoiceStageView(app, channel, onMinimize = close, onBack = close)
                            else com.wsgpolar.disband.ui.chat.ChannelChatScreen(app, channel, destination.serverName, close)
                        }
                        destination.dm != null -> DmChatScreen(app, destination.dm, close)
                        destination.group != null -> GroupChatScreen(app, destination.group, close)
                        else -> {
                            androidx.activity.compose.BackHandler(onBack = close)
                            androidx.compose.foundation.layout.Column(
                                Modifier.fillMaxSize().background(palette.background).statusBarsPadding().padding(24.dp),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = androidx.compose.foundation.layout.Arrangement.Center,
                            ) {
                                val waiting = if (selectedServerId != null) spaceLoading else inboxLoading
                                if (waiting) androidx.compose.material3.CircularProgressIndicator(color = palette.accent)
                                androidx.compose.material3.Text(
                                    if (waiting) "Opening conversation…" else "This conversation couldn't be opened.",
                                    color = palette.textSecondary,
                                )
                                if (!waiting) androidx.compose.material3.TextButton(onClick = { retryVersion++ }) {
                                    androidx.compose.material3.Text("Try again")
                                }
                                androidx.compose.material3.TextButton(onClick = close) { androidx.compose.material3.Text("Back") }
                            }
                        }
                    }
                }
            } else Box(Modifier.fillMaxSize())
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

    // The rail's + and Explore, and an invite link that opened the app.
    val openSpace: (String) -> Unit = { id -> shellChrome.navigateTo(Destination.Home, id) }
    if (showAddSpace) {
        AddSpaceSheet(
            app = app,
            onDismiss = { showAddSpace = false },
            onOpenSpace = openSpace,
            onExplore = { showDiscover = true },
        )
    }
    if (showDiscover) {
        DiscoverSheet(app = app, onDismiss = { showDiscover = false }, onOpenSpace = openSpace)
    }
    inviteToJoin?.let { code ->
        InviteJoinSheet(app = app, code = code, onDismiss = { inviteToJoin = null }, onOpenSpace = openSpace)
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
            onOpenSettings = { settingsFor = server },
        )
    }
    settingsFor?.let { server ->
        SpaceSettingsScreen(
            app = app,
            server = servers.firstOrNull { it.id == server.id } ?: server,
            onDismiss = { settingsFor = null },
            onDeleted = { shellChrome.selectedServerId = null },
            onChannelsChanged = {
                loadedSpaces.remove(server.id)
                retryVersion++
            },
        )
    }
}

private data class OpenConversation(
    val id: String,
    val channel: Channel?,
    val dm: DmThread?,
    val group: GroupChat?,
    val serverName: String,
)

/**
 * Android 13+ shows nothing until the app is allowed to post notifications,
 * and the only place that asked was a row deep in You — so most people never
 * got a message or call notification at all. Ask once after sign-in, as iOS
 * does; after that the row in You is the way back.
 */
@Composable
private fun AskForNotificationsOnce() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
    val context = LocalContext.current
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }
    LaunchedEffect(Unit) {
        val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        val prefs = context.getSharedPreferences("disband_prefs", Context.MODE_PRIVATE)
        if (granted || prefs.getBoolean(NOTIFICATIONS_ASKED, false)) return@LaunchedEffect
        prefs.edit().putBoolean(NOTIFICATIONS_ASKED, true).apply()
        launcher.launch(Manifest.permission.POST_NOTIFICATIONS)
    }
}

private const val NOTIFICATIONS_ASKED = "notifications_asked_v1"
