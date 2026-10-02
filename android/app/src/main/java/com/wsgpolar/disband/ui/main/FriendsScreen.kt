package com.wsgpolar.disband.ui.main

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.automirrored.filled.Sort
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wsgpolar.disband.core.Brand
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.core.color
import com.wsgpolar.disband.data.Database
import com.wsgpolar.disband.data.Friendship
import com.wsgpolar.disband.data.FriendshipStatus
import com.wsgpolar.disband.data.Profile
import com.wsgpolar.disband.data.UserStatus
import com.wsgpolar.disband.state.AppState
import com.wsgpolar.disband.ui.AvatarImage
import com.wsgpolar.disband.ui.collectAsStateValue
import com.wsgpolar.disband.ui.components.CapsuleFilterBar
import com.wsgpolar.disband.ui.components.CapsuleSearchField
import com.wsgpolar.disband.ui.components.EmptyState
import com.wsgpolar.disband.ui.components.ErrorState
import com.wsgpolar.disband.ui.components.FriendRow
import com.wsgpolar.disband.ui.components.ScreenHeader
import com.wsgpolar.disband.ui.components.SectionCaption
import com.wsgpolar.disband.ui.components.SettingsDivider
import com.wsgpolar.disband.ui.components.SettingsGroup
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

enum class FriendFilter(val title: String) {
    Online("Online"),
    All("All"),
    Pending("Pending"),
}

enum class FriendSort(val title: String) {
    Name("Name A–Z"),
    Recent("Recently added"),
    Oldest("Oldest first"),
}

/**
 * The friends list, matching iOS FriendsTab: a filter bar, a search field, an
 * "Active now" strip, and the pending requests both ways.
 *
 * Opening a DM is the caller's job. This screen only resolves the thread —
 * [onOpenDm] receives its id, and MainScreen loads the thread and points the
 * shell at it. Keeping navigation out of here means the screen has no opinion
 * about how the app is laid out.
 */
@Composable
fun FriendsScreen(
    app: AppState,
    onOpenDm: (threadId: String) -> Unit,
    onViewProfile: (Profile) -> Unit = {},
) {
    val palette = LocalPalette.current
    val uid = app.currentUserId
    val scope = rememberCoroutineScope()

    var friendships by remember { mutableStateOf<List<Friendship>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var loadError by remember { mutableStateOf<String?>(null) }
    var refreshing by remember { mutableStateOf(false) }
    var filter by remember { mutableStateOf(FriendFilter.Online) }
    var sort by remember { mutableStateOf(FriendSort.Name) }
    var sortMenu by remember { mutableStateOf(false) }
    var query by remember { mutableStateOf("") }
    var showAdd by remember { mutableStateOf(false) }
    var openingDm by remember { mutableStateOf<String?>(null) }

    suspend fun refresh(silent: Boolean = false) {
        if (uid == null) return
        if (!silent) loading = friendships.isEmpty()
        loadError = null
        try {
            friendships = Database.friendships(uid)
        } catch (e: Exception) {
            loadError = e.message ?: e.toString()
        }
        loading = false
        refreshing = false
    }

    LaunchedEffect(uid) {
        loading = true
        refresh()
    }

    /** The other party in a friendship, whichever side of it we are on. */
    fun peerOf(f: Friendship): Profile? =
        if (f.requesterId == uid) f.addressee else f.requester

    val accepted = friendships.filter { it.status == FriendshipStatus.Accepted }
    val incoming = friendships.filter { it.status == FriendshipStatus.Pending && it.addresseeId == uid }
    val outgoing = friendships.filter { it.status == FriendshipStatus.Pending && it.requesterId == uid }

    val presenceMap by app.presence.statuses.collectAsStateValue()
    fun isOnline(f: Friendship): Boolean {
        val peer = peerOf(f) ?: return false
        return (presenceMap[peer.id] ?: UserStatus.Offline) != UserStatus.Offline
    }
    val onlineFriends = accepted.filter(::isOnline)

    fun sortList(list: List<Friendship>): List<Friendship> = when (sort) {
        FriendSort.Name -> list.sortedBy { (peerOf(it)?.name ?: "").lowercase() }
        FriendSort.Recent -> list.sortedByDescending { it.createdAt ?: "" }
        FriendSort.Oldest -> list.sortedBy { it.createdAt ?: "" }
    }

    // Searching looks across all friends, not just the visible tab — searching
    // while on Online never found offline friends, which read as broken.
    val searching = query.isNotBlank()
    val searchBase = if (searching) accepted else when (filter) {
        FriendFilter.Online -> onlineFriends
        FriendFilter.All -> accepted
        FriendFilter.Pending -> emptyList()
    }
    val needle = query.trim().lowercase()
    val matchedFriends = sortList(
        if (needle.isBlank()) searchBase
        else accepted.filter { f ->
            val peer = peerOf(f)
            (peer?.name ?: "").lowercase().contains(needle) ||
                (peer?.username ?: "").lowercase().contains(needle)
        }
    )

    fun openDm(peer: Profile) {
        if (openingDm != null) return
        openingDm = peer.id
        scope.launch {
            val threadId = runCatching { Database.getOrCreateDmThread(peer.id) }.getOrNull()
            openingDm = null
            if (threadId != null) onOpenDm(threadId)
        }
    }

    Column(Modifier.fillMaxSize().background(palette.background)) {
        ScreenHeader(
            title = "Friends",
            subtitle = "${onlineFriends.size} online · ${accepted.size} total",
            actions = {
                // Sort control mirroring iOS (Name / Recently added / Oldest).
                Box {
                    IconButton(onClick = { sortMenu = true }, modifier = Modifier.size(48.dp)) {
                        Icon(
                            Icons.AutoMirrored.Filled.Sort,
                            contentDescription = "Sort friends: ${sort.title}",
                            tint = palette.textPrimary,
                        )
                    }
                    DropdownMenu(expanded = sortMenu, onDismissRequest = { sortMenu = false }) {
                        FriendSort.entries.forEach { option ->
                            DropdownMenuItem(
                                text = { Text(option.title) },
                                onClick = { sort = option; sortMenu = false },
                                trailingIcon = {
                                    if (option == sort) Icon(
                                        Icons.Filled.Check,
                                        contentDescription = null,
                                        tint = palette.accent,
                                        modifier = Modifier.size(18.dp),
                                    )
                                },
                            )
                        }
                    }
                }
                // Add pill mirroring iOS — a labelled capsule, not a bare icon.
                Box(
                    Modifier
                        .clip(CircleShape)
                        .background(Brush.horizontalGradient(listOf(palette.accent, palette.accentSoft)))
                        .clickable(role = Role.Button, onClickLabel = "Add friend", onClick = { showAdd = true })
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            Icons.Filled.PersonAdd,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(16.dp),
                        )
                        Spacer(Modifier.width(6.dp))
                        Text("Add", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
                Spacer(Modifier.width(4.dp))
                IconButton(
                    onClick = { scope.launch { refreshing = true; refresh(silent = true) } },
                    modifier = Modifier.size(48.dp),
                ) {
                    Icon(Icons.Filled.Refresh, contentDescription = "Refresh friends", tint = palette.textPrimary)
                }
            },
        )
        HorizontalDivider(color = palette.divider)

        CapsuleFilterBar(
            options = FriendFilter.entries,
            selected = filter,
            onSelect = { filter = it },
            title = { it.title },
            badge = { if (it == FriendFilter.Pending) incoming.size else 0 },
            modifier = Modifier.padding(top = 10.dp),
        )

        if (filter != FriendFilter.Pending) {
            CapsuleSearchField(
                text = query,
                onValueChange = { query = it },
                prompt = "Search friends",
                modifier = Modifier.padding(top = 10.dp),
            )
        }

        when {
            loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = palette.accent)
            }

            loadError != null && friendships.isEmpty() -> ErrorState(
                message = loadError ?: "Unknown error",
                onRetry = { scope.launch { loading = true; refresh() } },
            )

            filter == FriendFilter.Pending -> PendingContent(
                incoming = incoming,
                outgoing = outgoing,
                onRespond = { id, accept ->
                    scope.launch {
                        runCatching { Database.respondToFriendRequest(id, accept) }
                        refresh(silent = true)
                    }
                },
            )

            matchedFriends.isEmpty() -> {
                if (searching) {
                    EmptyState(title = "No matches", detail = "No friends match \"$query\".")
                } else if (accepted.isEmpty()) {
                    EmptyState(
                        title = "No friends yet",
                        detail = "Find someone by their exact username.",
                        actionLabel = "Add friend",
                        onAction = { showAdd = true },
                    )
                } else if (filter == FriendFilter.Online) {
                    EmptyState(title = "Nobody's online", detail = "Your friends will show up here when they are.")
                } else {
                    EmptyState(title = "No friends here yet")
                }
            }

            else -> Column(Modifier.verticalScroll(rememberScrollState())) {
                // Active-now strip only on the unfiltered Online view, as on iOS.
                if (query.isBlank() && filter == FriendFilter.Online && onlineFriends.isNotEmpty()) {
                    ActiveNowStrip(
                        profiles = onlineFriends.mapNotNull { peerOf(it) },
                        statusOf = { presenceMap[it.id] ?: UserStatus.Offline },
                        onSelect = onViewProfile,
                    )
                }
                SectionCaption(
                    when {
                        searching -> "Results — ${matchedFriends.size}"
                        filter == FriendFilter.Online -> "Online — ${matchedFriends.size}"
                        else -> "All friends — ${matchedFriends.size}"
                    }
                )
                FriendsList(
                    friends = matchedFriends,
                    peerOf = ::peerOf,
                    statusOf = { presenceMap[it.id] ?: UserStatus.Offline },
                    onOpenDm = ::openDm,
                    onViewProfile = onViewProfile,
                    openingDmId = openingDm,
                )
                Spacer(Modifier.size(96.dp)) // clears the floating dock
            }
        }
    }

    if (showAdd) {
        AddFriendSheet(
            app = app,
            onDismiss = { showAdd = false },
            onAdded = { scope.launch { refresh(silent = true) } },
        )
    }
}

@Composable
private fun ActiveNowStrip(
    profiles: List<Profile>,
    statusOf: (Profile) -> UserStatus,
    onSelect: (Profile) -> Unit,
) {
    val palette = LocalPalette.current
    if (profiles.isEmpty()) return
    Column {
        SectionCaption("Active now")
        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            contentPadding = PaddingValues(horizontal = 20.dp, vertical = 8.dp),
        ) {
            items(profiles, key = { it.id }) { profile ->
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier
                        .width(64.dp)
                        .clip(CircleShape)
                        .clickable(role = Role.Button, onClickLabel = "View ${profile.name}", onClick = { onSelect(profile) })
                        .padding(vertical = 4.dp),
                ) {
                    AvatarImage(
                        url = profile.avatarUrl,
                        name = profile.name,
                        size = 58.dp,
                        presence = statusOf(profile).color(palette),
                    )
                    Spacer(Modifier.size(4.dp))
                    Text(
                        profile.name,
                        color = palette.textSecondary,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Medium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

@Composable
private fun FriendsList(
    friends: List<Friendship>,
    peerOf: (Friendship) -> Profile?,
    statusOf: (Profile) -> UserStatus,
    onOpenDm: (Profile) -> Unit,
    onViewProfile: (Profile) -> Unit,
    openingDmId: String? = null,
) {
    val palette = LocalPalette.current
    SettingsGroup {
        friends.forEachIndexed { index, friendship ->
            val peer = peerOf(friendship) ?: return@forEachIndexed
            if (index > 0) SettingsDivider(Modifier.padding(start = 66.dp))
            Row(
                Modifier
                    .fillMaxWidth()
                    .clickable(role = Role.Button, onClickLabel = "View ${peer.name}", onClick = { onViewProfile(peer) })
                    .padding(horizontal = 14.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                FriendRow(
                    profile = peer,
                    status = statusOf(peer),
                    modifier = Modifier.weight(1f),
                    trailing = {
                        if (openingDmId == peer.id) {
                            CircularProgressIndicator(
                                color = palette.accent,
                                modifier = Modifier.size(20.dp),
                                strokeWidth = 2.dp,
                            )
                        } else {
                            IconButton(
                                onClick = { onOpenDm(peer) },
                                modifier = Modifier.size(48.dp),
                            ) {
                                Icon(
                                    Icons.AutoMirrored.Filled.Chat,
                                    contentDescription = "Message ${peer.name}",
                                    tint = palette.textSecondary,
                                    modifier = Modifier.size(20.dp),
                                )
                            }
                        }
                    },
                )
            }
        }
    }
}

@Composable
private fun PendingContent(
    incoming: List<Friendship>,
    outgoing: List<Friendship>,
    onRespond: (id: String, accept: Boolean) -> Unit,
) {
    val palette = LocalPalette.current
    if (incoming.isEmpty() && outgoing.isEmpty()) {
        EmptyState(title = "No pending requests", detail = "Friend requests will show up here.")
        return
    }

    Column(Modifier.verticalScroll(rememberScrollState())) {
        if (incoming.isNotEmpty()) {
            SectionCaption("Incoming — ${incoming.size}")
            SettingsGroup {
                incoming.forEachIndexed { index, friendship ->
                    val peer = friendship.requester ?: return@forEachIndexed
                    if (index > 0) SettingsDivider(Modifier.padding(start = 66.dp))
                    Row(
                        Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        FriendRow(profile = peer, modifier = Modifier.weight(1f))
                        IconButton(
                            onClick = { onRespond(friendship.id, false) },
                            modifier = Modifier.size(48.dp),
                        ) {
                            Icon(Icons.Filled.Close, "Decline request from ${peer.name}", tint = Brand.dnd, modifier = Modifier.size(20.dp))
                        }
                        IconButton(
                            onClick = { onRespond(friendship.id, true) },
                            modifier = Modifier.size(48.dp),
                        ) {
                            Icon(Icons.Filled.Check, "Accept request from ${peer.name}", tint = Brand.online, modifier = Modifier.size(20.dp))
                        }
                    }
                }
            }
        }

        if (outgoing.isNotEmpty()) {
            SectionCaption("Sent — ${outgoing.size}")
            SettingsGroup {
                outgoing.forEachIndexed { index, friendship ->
                    val peer = friendship.addressee ?: return@forEachIndexed
                    if (index > 0) SettingsDivider(Modifier.padding(start = 66.dp))
                    Row(
                        Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        FriendRow(profile = peer, modifier = Modifier.weight(1f))
                        Text(
                            "Waiting",
                            color = palette.textMuted,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier
                                .clip(CircleShape)
                                .background(palette.elevated)
                                .padding(horizontal = 10.dp, vertical = 6.dp),
                        )
                    }
                }
            }
        }
        Spacer(Modifier.size(96.dp))
    }
}

@Composable
private fun AddFriendSheet(
    app: AppState,
    onDismiss: () -> Unit,
    onAdded: () -> Unit,
) {
    val palette = LocalPalette.current
    val uid = app.currentUserId ?: return
    val scope = rememberCoroutineScope()
    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<Profile>>(emptyList()) }
    var searching by remember { mutableStateOf(false) }
    var sent by remember { mutableStateOf<Set<String>>(emptySet()) }

    // Debounced so a search does not fire on every keystroke. Database
    // .searchProfiles is an exact username match, so a partial word finds
    // nothing until the name is complete — which is what the prompt says.
    LaunchedEffect(query) {
        val needle = query.trim()
        if (needle.isBlank()) {
            results = emptyList()
            searching = false
            return@LaunchedEffect
        }
        searching = true
        delay(350)
        results = runCatching { Database.searchProfiles(needle) }.getOrDefault(emptyList())
        searching = false
    }

    Box(Modifier.fillMaxSize().background(palette.background)) {
        Column {
            ScreenHeader(
                title = "Add friend",
                subtitle = "Find someone by their exact username",
                actions = {
                    IconButton(onClick = onDismiss, modifier = Modifier.size(48.dp)) {
                        Icon(Icons.Filled.Close, contentDescription = "Close", tint = palette.textPrimary)
                    }
                },
            )
            HorizontalDivider(color = palette.divider)

            CapsuleSearchField(
                text = query,
                onValueChange = { query = it },
                prompt = "Enter their exact username",
                modifier = Modifier.padding(top = 12.dp),
            )

            when {
                searching -> Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = palette.accent, modifier = Modifier.size(22.dp))
                }

                query.isNotBlank() && results.isEmpty() -> Box(
                    Modifier.fillMaxWidth().padding(24.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("No account with that exact username", color = palette.textMuted, fontSize = 14.sp)
                }

                else -> LazyColumn {
                    items(results, key = { it.id }) { profile ->
                        Row(
                            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            FriendRow(profile = profile, modifier = Modifier.weight(1f))
                            when {
                                profile.id == uid ->
                                    Text("You", color = palette.textMuted, fontSize = 12.sp)
                                profile.id in sent ->
                                    Text("Sent", color = palette.textMuted, fontSize = 12.sp)
                                else -> Button(
                                    onClick = {
                                        scope.launch {
                                            val ok = runCatching {
                                                Database.sendFriendRequest(uid, profile.id)
                                            }.isSuccess
                                            if (ok) {
                                                sent = sent + profile.id
                                                onAdded()
                                            }
                                        }
                                    },
                                    colors = ButtonDefaults.buttonColors(
                                        containerColor = palette.accent,
                                        contentColor = Color.White,
                                    ),
                                ) {
                                    Text("Add", fontSize = 13.sp)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
