package com.wsgpolar.disband.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.runtime.collectAsState
import kotlinx.coroutines.launch
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.core.TimeFormat
import com.wsgpolar.disband.core.seeded
import com.wsgpolar.disband.data.Database
import com.wsgpolar.disband.data.Profile
import androidx.compose.ui.Alignment
import com.wsgpolar.disband.ui.AvatarDecoration
import com.wsgpolar.disband.ui.AvatarImage
import com.wsgpolar.disband.ui.components.ProfileActivityCards
import com.wsgpolar.disband.ui.components.ProfileBadges

/**
 * Someone's profile, opened by tapping their avatar or name in a chat or a
 * member list. The newest copy the app has shows at once (ProfileStore, kept
 * live by Realtime), then a fresh read fills in anything missing. In a space
 * it lists their roles as the web's popout does, and it offers friend,
 * remove and block actions.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun UserProfileSheet(initial: Profile, serverId: String? = null, onDismiss: () -> Unit) {
    val palette = LocalPalette.current
    val stored by com.wsgpolar.disband.data.ProfileStore.profiles.collectAsState()
    var fetched by remember(initial.id) { mutableStateOf<Profile?>(null) }
    // The store is patched by your own edits and by live updates, so it wins
    // over the copy this sheet was opened with.
    val profile = stored[initial.id] ?: fetched ?: initial
    LaunchedEffect(initial.id) {
        // Kept fresh while open, so a song or game change shows up.
        while (true) {
            runCatching { Database.profile(initial.id) }.getOrNull()?.let { fetched = it }
            kotlinx.coroutines.delay(20_000)
        }
    }
    // Roles exist only in a space: a DM or group chat opens this with no
    // serverId, so nothing is read and no roster leaks in (bugs 1984bf74 / ad0498d5).
    val roles by androidx.compose.runtime.produceState<List<com.wsgpolar.disband.data.ServerAdmin.Role>?>(
        com.wsgpolar.disband.data.ServerRoster.cached(serverId)?.takeIf { r -> r.memberRoles.containsKey(initial.id) }
            ?.rolesOf(initial.id),
        serverId, initial.id,
    ) {
        if (serverId != null) value = runCatching { com.wsgpolar.disband.data.ServerRoster.rolesFor(serverId, initial.id) }.getOrNull() ?: value
    }
    val me = remember { com.wsgpolar.disband.core.DisbandSupabase.auth.currentUserOrNull()?.id }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = palette.surface,
        dragHandle = null,
    ) {
        Column(Modifier.navigationBarsPadding().padding(bottom = 24.dp)) {
            Box(Modifier.fillMaxWidth().height(120.dp)) {
                val banner = profile.bannerUrl
                if (!banner.isNullOrBlank()) {
                    AsyncImage(model = banner, contentDescription = null, contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize())
                } else {
                    val accent = profile.accentColor?.let { runCatching { Color(android.graphics.Color.parseColor(it)) }.getOrNull() }
                    Box(Modifier.fillMaxSize().background(
                        accent?.let { Brush.linearGradient(listOf(it, it.copy(alpha = 0.6f))) }
                            ?: Brush.linearGradient(listOf(Color.seeded(profile.id), Color.seeded(profile.id + "·"))),
                    ))
                }
            }
            Box(Modifier.padding(start = 16.dp).offset(y = (-44).dp)) {
                Box(Modifier.clip(CircleShape).background(palette.surface).padding(5.dp)) {
                    AvatarImage(url = profile.avatarUrl, name = profile.name, size = 84.dp)
                }
                // Outside the clipped ring, centred on the photo.
                AvatarDecoration(profile.equippedRingEffect, avatarSize = 84.dp, Modifier.align(Alignment.Center))
            }
            Column(Modifier.offset(y = (-34).dp).padding(horizontal = 20.dp)) {
                com.wsgpolar.disband.ui.components.DisplayNameText(
                    profile, fontSize = 22.sp, fontWeight = FontWeight.Bold,
                    role = roles?.firstOrNull(), roleGradient = true,
                )
                val sub = listOfNotNull("@${profile.handle}", profile.pronouns?.takeIf { it.isNotBlank() }).joinToString(" · ")
                Text(sub, color = palette.textMuted, fontSize = 14.sp)
                ProfileBadges(profile.id, Modifier.padding(top = 8.dp))

                profile.activeStatusNote?.let {
                    Spacer(Modifier.height(12.dp))
                    Text(
                        it,
                        color = palette.textSecondary,
                        fontSize = 14.sp,
                        modifier = Modifier.clip(RoundedCornerShape(12.dp)).background(palette.elevated)
                            .padding(horizontal = 12.dp, vertical = 8.dp),
                    )
                }

                ProfileActivityCards(profile.listening, profile.activity, Modifier.padding(top = 12.dp))

                profile.bio?.takeIf { it.isNotBlank() }?.let {
                    Spacer(Modifier.height(16.dp))
                    Text("ABOUT ME", color = palette.textMuted, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(4.dp))
                    Text(it, color = palette.textPrimary, fontSize = 15.sp)
                }

                // "Role" for one, "Roles" otherwise; only in a space, only with roles.
                roles?.takeIf { it.isNotEmpty() }?.let { list ->
                    Spacer(Modifier.height(16.dp))
                    Text(if (list.size == 1) "ROLE" else "ROLES", color = palette.textMuted, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(6.dp))
                    com.wsgpolar.disband.ui.components.RolePills(list)
                }

                profile.createdAt?.let { joined ->
                    Spacer(Modifier.height(16.dp))
                    Text("MEMBER SINCE", color = palette.textMuted, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(4.dp))
                    // A date, not "Mon 10:30 PM": when someone joined is about the day.
                    val since = TimeFormat.parse(joined)?.atZone(java.time.ZoneId.systemDefault())?.toLocalDate()
                    Text(
                        since?.let { TimeFormat.dayHeader(it) } ?: "",
                        color = palette.textPrimary,
                        fontSize = 15.sp,
                    )
                }

                if (me != null && me != profile.id && profile.isBot != true) {
                    Spacer(Modifier.height(20.dp))
                    ProfileRelationshipActions(me, profile)
                }
            }
        }
    }
}

/** Add, remove or block, the actions the web's popout and iOS offer. */
@Composable
private fun ProfileRelationshipActions(me: String, profile: Profile) {
    val palette = LocalPalette.current
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    var link by remember(profile.id) { mutableStateOf<Database.FriendshipLink?>(null) }
    var loaded by remember(profile.id) { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var confirm by remember { mutableStateOf<String?>(null) }
    suspend fun reload() {
        link = runCatching { Database.friendshipWith(me, profile.id) }.getOrNull()
        loaded = true
    }
    LaunchedEffect(profile.id) { reload() }
    if (!loaded) return

    fun act(block: suspend () -> Unit) {
        if (busy) return
        busy = true
        error = null
        scope.launch {
            try { block(); reload() }
            catch (e: kotlinx.coroutines.CancellationException) { throw e }
            catch (_: Exception) { error = "That didn't work. Try again." }
            finally { busy = false }
        }
    }

    val current = link
    val blockedByMe = current?.status == com.wsgpolar.disband.data.FriendshipStatus.Blocked && current.requesterId == me
    androidx.compose.foundation.layout.Row(horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(8.dp)) {
        when {
            blockedByMe -> ActionChip("Unblock", palette.textPrimary) { act { Database.unblockUser(profile.id) } }
            current == null -> ActionChip("Add friend", palette.accent) { act { Database.sendFriendRequest(me, profile.id) } }
            current.status == com.wsgpolar.disband.data.FriendshipStatus.Pending && current.requesterId == me ->
                ActionChip("Cancel request", palette.textPrimary) { act { Database.removeFriend(me, profile.id) } }
            current.status == com.wsgpolar.disband.data.FriendshipStatus.Pending ->
                ActionChip("Accept request", palette.accent) { act { Database.respondToFriendRequest(current.id, true) } }
            current.status == com.wsgpolar.disband.data.FriendshipStatus.Accepted ->
                ActionChip("Remove friend", com.wsgpolar.disband.core.Brand.dnd) { confirm = "remove" }
        }
        if (!blockedByMe) ActionChip("Block", com.wsgpolar.disband.core.Brand.dnd) { confirm = "block" }
    }
    error?.let { Text(it, color = com.wsgpolar.disband.core.Brand.dnd, fontSize = 13.sp, modifier = Modifier.padding(top = 6.dp)) }

    confirm?.let { kind ->
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { confirm = null },
            title = { Text(if (kind == "block") "Block ${profile.name}?" else "Remove ${profile.name}?") },
            text = {
                Text(
                    if (kind == "block") "They won't be able to message you, and they'll be removed from your friends."
                    else "You'll no longer be friends. You can add them again later.",
                )
            },
            confirmButton = {
                androidx.compose.material3.TextButton(onClick = {
                    confirm = null
                    if (kind == "block") act { Database.blockUser(profile.id) } else act { Database.removeFriend(me, profile.id) }
                }) { Text(if (kind == "block") "Block" else "Remove", color = com.wsgpolar.disband.core.Brand.dnd) }
            },
            dismissButton = { androidx.compose.material3.TextButton(onClick = { confirm = null }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun ActionChip(label: String, tint: Color, onClick: () -> Unit) {
    val palette = LocalPalette.current
    Box(
        Modifier.clip(RoundedCornerShape(12.dp)).background(palette.elevated)
            .androidx_clickable(onClick)
            .padding(horizontal = 14.dp, vertical = 10.dp),
    ) {
        Text(label, color = tint, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
    }
}

private fun Modifier.androidx_clickable(onClick: () -> Unit): Modifier =
    this.then(Modifier.clickable(role = androidx.compose.ui.semantics.Role.Button, onClick = onClick))
