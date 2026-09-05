package com.wsgpolar.disband.ui.main

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.core.Palette
import com.wsgpolar.disband.core.color
import com.wsgpolar.disband.data.Database
import com.wsgpolar.disband.data.Friendship
import com.wsgpolar.disband.data.FriendshipStatus
import com.wsgpolar.disband.data.Profile
import com.wsgpolar.disband.data.UserStatus
import com.wsgpolar.disband.state.AppState
import com.wsgpolar.disband.ui.AvatarImage
import com.wsgpolar.disband.ui.chat.CallActionButton
import com.wsgpolar.disband.ui.collectAsStateValue
import kotlinx.coroutines.launch

@Composable
fun FriendsScreen(app: AppState) {
    val palette = LocalPalette.current
    val uid = app.currentUserId
    val profile by app.profile.collectAsStateValue()
    val scope = rememberCoroutineScope()

    var friendships by remember { mutableStateOf<List<Friendship>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }

    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<Profile>>(emptyList()) }
    var searching by remember { mutableStateOf(false) }

    suspend fun refresh() {
        if (uid == null) return
        friendships = runCatching { Database.friendships(uid) }.getOrDefault(emptyList())
        loading = false
    }

    LaunchedEffect(uid) {
        loading = true
        refresh()
    }

    Column(Modifier.fillMaxSize().background(palette.background)) {
        TopBar(palette = palette, title = "Friends", onStatusClick = {
            // Cycle simple status quickly.
            scope.launch {
                val next = when (profile?.status) {
                    UserStatus.Online -> UserStatus.Idle
                    UserStatus.Idle -> UserStatus.Dnd
                    UserStatus.Dnd -> UserStatus.Offline
                    else -> UserStatus.Online
                }
                app.setStatus(next)
            }
        }, status = profile?.status)
        HorizontalDivider(color = palette.divider)

        Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
            OutlinedTextField(
                value = query,
                onValueChange = { q ->
                    query = q
                    if (q.isNotBlank()) {
                        searching = true
                        scope.launch {
                            results = runCatching { Database.searchProfiles(q) }.getOrDefault(emptyList())
                            searching = false
                        }
                    } else {
                        results = emptyList()
                        searching = false
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("Search people to add", color = palette.textMuted) },
                singleLine = true,
            )
            if (query.isNotBlank()) {
                if (searching) {
                    Box(Modifier.padding(12.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = palette.accent, modifier = Modifier.size(22.dp))
                    }
                } else if (results.isEmpty()) {
                    Text("No results", color = palette.textMuted, fontSize = 13.sp,
                        modifier = Modifier.padding(vertical = 8.dp))
                } else {
                    results.forEach { found ->
                        val already = friendships.any {
                            (it.requesterId == uid && it.addresseeId == found.id) ||
                                (it.requesterId == found.id && it.addresseeId == uid)
                        }
                        SearchRow(palette = palette, profile = found, added = already, onAdd = {
                            scope.launch {
                                runCatching { Database.sendFriendRequest(uid!!, found.id) }
                                query = ""
                                results = emptyList()
                                refresh()
                            }
                        })
                    }
                }
            }
        }

        when {
            loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = palette.accent)
            }
            else -> {
                val pendingIn = friendships.filter { it.status == FriendshipStatus.Pending && it.addresseeId == uid }
                val accepted = friendships.filter { it.status == FriendshipStatus.Accepted }

                LazyColumn(Modifier.fillMaxSize()) {
                    if (pendingIn.isNotEmpty()) {
                        item { SectionLabel("Requests", palette) }
                        items(pendingIn, key = { "in:${it.id}" }) { friend ->
                            val requester = friend.requester
                            RequestRow(palette = palette, profile = requester, onAccept = {
                                scope.launch {
                                    runCatching { Database.respondToFriendRequest(friend.id, accept = true) }
                                    refresh()
                                }
                            }, onDecline = {
                                scope.launch {
                                    runCatching { Database.respondToFriendRequest(friend.id, accept = false) }
                                    refresh()
                                }
                            })
                        }
                    }
                    if (accepted.isEmpty() && pendingIn.isEmpty()) {
                        item {
                            Text("Add friends by searching above", color = palette.textMuted,
                                fontSize = 14.sp, modifier = Modifier.padding(16.dp))
                        }
                    }
                    items(accepted, key = { "a:${it.id}" }) { friend ->
                        val peer = if (friend.requesterId == uid) friend.addressee else friend.requester
                        FriendRow(
                            palette = palette,
                            profile = peer ?: Profile(id = "", username = "Unknown"),
                            call = peer?.let { p -> @Composable { CallActionButton(app, p) } },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun TopBar(palette: Palette, title: String, status: UserStatus?, onStatusClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .background(palette.surface)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(title, color = palette.textPrimary, fontSize = 22.sp, fontWeight = FontWeight.Bold,
            modifier = Modifier.weight(1f))
        val statusColor = status?.color(palette) ?: palette.textMuted
        FilterChip(
            selected = false,
            onClick = onStatusClick,
            label = { Text((status ?: UserStatus.Offline).shortLabel, color = palette.textPrimary, fontSize = 13.sp) },
            leadingIcon = {
                Box(Modifier.size(10.dp).background(statusColor, androidx.compose.foundation.shape.CircleShape))
            },
        )
    }
}

@Composable
private fun SectionLabel(label: String, palette: Palette) {
    Text(label, color = palette.textMuted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
        modifier = Modifier.padding(start = 16.dp, top = 14.dp, bottom = 6.dp))
}

@Composable
private fun SearchRow(palette: Palette, profile: Profile, added: Boolean, onAdd: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AvatarImage(url = profile.avatarUrl, name = profile.name, size = 40.dp)
        Column(Modifier.padding(start = 10.dp).weight(1f)) {
            Text(profile.name, color = palette.textPrimary, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            Text("@" + profile.handle, color = palette.textMuted, fontSize = 13.sp)
        }
        if (added) {
            Text("Added", color = palette.textMuted, fontSize = 13.sp)
        } else {
            OutlinedButton(onClick = onAdd, modifier = Modifier.height(34.dp)) {
                Text("Add", color = palette.accent, fontSize = 13.sp)
            }
        }
    }
}

@Composable
private fun RequestRow(palette: Palette, profile: Profile?, onAccept: () -> Unit, onDecline: () -> Unit) {
    if (profile == null) return
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AvatarImage(url = profile.avatarUrl, name = profile.name, size = 40.dp)
        Column(Modifier.padding(start = 10.dp).weight(1f)) {
            Text(profile.name, color = palette.textPrimary, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            Text("@" + profile.handle, color = palette.textMuted, fontSize = 13.sp)
        }
        OutlinedButton(onClick = onDecline, modifier = Modifier.height(34.dp)) {
            Text("Decline", color = palette.textMuted, fontSize = 13.sp)
        }
        Spacer(Modifier.width(8.dp))
        Button(onClick = onAccept, modifier = Modifier.height(34.dp)) {
            Text("Accept", fontSize = 13.sp)
        }
    }
    HorizontalDivider(color = palette.divider, modifier = Modifier.padding(start = 66.dp))
}

@Composable
private fun FriendRow(
    palette: Palette,
    profile: Profile,
    call: (@Composable () -> Unit)?,
) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AvatarImage(url = profile.avatarUrl, name = profile.name, size = 40.dp)
        Column(Modifier.padding(start = 10.dp).weight(1f)) {
            Text(profile.name, color = palette.textPrimary, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            Text("@" + profile.handle, color = palette.textMuted, fontSize = 13.sp)
        }
        call?.invoke()
    }
    HorizontalDivider(color = palette.divider, modifier = Modifier.padding(start = 66.dp))
}