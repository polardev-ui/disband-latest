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
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material3.Button
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
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
import com.wsgpolar.disband.ui.components.CapsuleFilterBar
import com.wsgpolar.disband.ui.components.CapsuleSearchField
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
    var filter by remember { mutableStateOf(FriendFilter.Online) }
    var query by remember { mutableStateOf("") }
    var showAdd by remember { mutableStateOf(false) }

    suspend fun refresh() {
        if (uid == null) return
        friendships = runCatching { Database.friendships(uid) }.getOrDefault(emptyList())
        loading = false
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

    val onlineFriends = accepted.filter { f ->
        val peer = peerOf(f) ?: return@filter false
        app.presence.status(peer.id) != UserStatus.Offline
    }

    val visibleFriends = when (filter) {
        FriendFilter.Online -> onlineFriends
        FriendFilter.All -> accepted
        FriendFilter.Pending -> emptyList()
    }

    val matchedFriends = if (query.isBlank()) visibleFriends else visibleFriends.filter { f ->
        val peer = peerOf(f)
        val needle = query.trim().lowercase()
        (peer?.name ?: "").lowercase().contains(needle) ||
            (peer?.username ?: "").lowercase().contains(needle)
    }

    fun openDm(peer: Profile) {
        scope.launch {
            val threadId = runCatching { Database.getOrCreateDmThread(peer.id) }.getOrNull()
            if (threadId != null) onOpenDm(threadId)
        }
    }

    Column(Modifier.fillMaxSize().background(palette.background)) {
        ScreenHeader(
            title = "Friends",
            subtitle = "${onlineFriends.size} online · ${accepted.size} total",
            actions = {
                IconButton(onClick = { showAdd = true }) {
                    Icon(Icons.Filled.PersonAdd, contentDescription = "Add friend", tint = palette.textPrimary)
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
            modifier = Modifier.padding(vertical = 10.dp),
        )

        if (filter != FriendFilter.Pending) {
            CapsuleSearchField(
                text = query,
                onValueChange = { query = it },
                prompt = "Search friends",
            )
        }

        when {
            loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = palette.accent)
            }

            filter == FriendFilter.Pending -> PendingContent(
                incoming = incoming,
                outgoing = outgoing,
                onRespond = { id, accept ->
                    scope.launch {
                        runCatching { Database.respondToFriendRequest(id, accept) }
                        refresh()
                    }
                },
            )

            matchedFriends.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(
                    if (query.isBlank()) "No friends here yet" else "No one matches \"$query\"",
                    color = palette.textMuted,
                    fontSize = 14.sp,
                )
            }

            else -> Column(Modifier.verticalScroll(rememberScrollState())) {
                if (query.isBlank() && onlineFriends.isNotEmpty()) {
                    ActiveNowStrip(
                        profiles = onlineFriends.mapNotNull { peerOf(it) },
                        statusOf = { app.presence.status(it.id) },
                        onSelect = onViewProfile,
                    )
                }
                FriendsList(
                    friends = matchedFriends,
                    peerOf = ::peerOf,
                    statusOf = { app.presence.status(it.id) },
                    onOpenDm = ::openDm,
                    onViewProfile = onViewProfile,
                )
                Spacer(Modifier.size(96.dp)) // clears the floating dock
            }
        }
    }

    if (showAdd) {
        AddFriendSheet(
            app = app,
            onDismiss = { showAdd = false },
            onAdded = { scope.launch { refresh() } },
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
                    modifier = Modifier.width(64.dp).clickable { onSelect(profile) },
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
) {
    val palette = LocalPalette.current
    SettingsGroup {
        friends.forEachIndexed { index, friendship ->
            val peer = peerOf(friendship) ?: return@forEachIndexed
            if (index > 0) SettingsDivider(Modifier.padding(start = 66.dp))
            Row(
                Modifier
                    .fillMaxWidth()
                    .clickable { onViewProfile(peer) }
                    .padding(horizontal = 14.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                FriendRow(
                    profile = peer,
                    status = statusOf(peer),
                    modifier = Modifier.weight(1f),
                    trailing = {
                        IconButton(onClick = { onOpenDm(peer) }) {
                            Icon(
                                Icons.AutoMirrored.Filled.Chat,
                                contentDescription = "Message ${peer.name}",
                                tint = palette.textSecondary,
                                modifier = Modifier.size(20.dp),
                            )
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
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("No pending requests", color = palette.textMuted, fontSize = 14.sp)
        }
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
                            modifier = Modifier.size(36.dp),
                        ) {
                            Icon(Icons.Filled.Close, "Decline", tint = Brand.dnd, modifier = Modifier.size(20.dp))
                        }
                        IconButton(
                            onClick = { onRespond(friendship.id, true) },
                            modifier = Modifier.size(36.dp),
                        ) {
                            Icon(Icons.Filled.Check, "Accept", tint = Brand.online, modifier = Modifier.size(20.dp))
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
                                .padding(horizontal = 10.dp, vertical = 4.dp),
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
                    IconButton(onClick = onDismiss) {
                        Icon(Icons.Filled.Close, contentDescription = "Close", tint = palette.textPrimary)
                    }
                },
            )
            HorizontalDivider(color = palette.divider)

            CapsuleSearchField(
                text = query,
                onValueChange = { query = it },
                prompt = "Enter their exact username",
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
                                else -> Button(onClick = {
                                    scope.launch {
                                        val ok = runCatching {
                                            Database.sendFriendRequest(uid, profile.id)
                                        }.isSuccess
                                        if (ok) {
                                            sent = sent + profile.id
                                            onAdded()
                                        }
                                    }
                                }) {
                                    Text("Add", color = Color.White, fontSize = 13.sp)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
