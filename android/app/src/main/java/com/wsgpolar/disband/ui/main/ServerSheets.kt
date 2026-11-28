package com.wsgpolar.disband.ui.main

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.ui.draw.alpha
import com.wsgpolar.disband.core.color
import androidx.compose.ui.graphics.Color
import androidx.compose.runtime.collectAsState
import androidx.compose.material.icons.filled.WorkspacePremium
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.DoneAll
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wsgpolar.disband.core.Brand
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.data.Database
import com.wsgpolar.disband.data.MemberRole
import com.wsgpolar.disband.data.Server
import com.wsgpolar.disband.data.ServerAdmin
import com.wsgpolar.disband.data.ServerMember
import com.wsgpolar.disband.state.AppState
import com.wsgpolar.disband.ui.AvatarImage
import kotlinx.coroutines.launch

/**
 * The sheets behind Invite, Members and the ⋯ menu on a space.
 *
 * None of these existed. `MainScreen` declared `onInvite`, `onMembers` and
 * `onOverflow` as parameters defaulting to `{}` — with a comment calling them
 * "wiring hooks for later agents" — and the one call site passed none of
 * them. So all three buttons ran an empty lambda: no crash, no log, nothing
 * on screen, and nothing for the compiler to object to. A default of `{}` on
 * a required callback is how a button ships dead.
 */

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InviteSheet(server: Server, onDismiss: () -> Unit) {
    val palette = LocalPalette.current
    val context = LocalContext.current
    val link = server.inviteUrl

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(),
        containerColor = palette.surface,
    ) {
        Column(Modifier.padding(horizontal = 20.dp).padding(bottom = 28.dp).navigationBarsPadding()) {
            Text("Invite to ${server.name}", color = palette.textPrimary,
                fontSize = 20.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(6.dp))
            Text(
                if (link != null) "Anyone with this link can join."
                else "This space has no invite link yet.",
                color = palette.textMuted, fontSize = 14.sp,
            )
            Spacer(Modifier.height(18.dp))

            if (link != null) {
                Box(
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(palette.elevated)
                        .padding(14.dp)
                ) {
                    Text(
                        link,
                        color = palette.textPrimary,
                        fontSize = 14.sp,
                        fontFamily = FontFamily.Monospace,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    SheetAction("Copy link", Icons.Filled.ContentCopy, Modifier.weight(1f), palette) {
                        copyToClipboard(context, link)
                        onDismiss()
                    }
                    SheetAction("Share", Icons.Filled.Share, Modifier.weight(1f), palette) {
                        context.startActivity(
                            Intent.createChooser(
                                Intent(Intent.ACTION_SEND).apply {
                                    type = "text/plain"
                                    putExtra(Intent.EXTRA_TEXT, "Join ${server.name} on Disband: $link")
                                },
                                "Invite to ${server.name}",
                            )
                        )
                        onDismiss()
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MembersSheet(
    server: Server,
    presence: kotlinx.coroutines.flow.StateFlow<Map<String, com.wsgpolar.disband.data.UserStatus>>? = null,
    onDismiss: () -> Unit,
) {
    val palette = LocalPalette.current
    val scope = rememberCoroutineScopeCompat()
    val context = LocalContext.current
    var members by remember(server.id) { mutableStateOf<List<ServerMember>>(emptyList()) }
    var loading by remember(server.id) { mutableStateOf(true) }
    var loadError by remember(server.id) { mutableStateOf<String?>(null) }
    var query by remember(server.id) { mutableStateOf("") }
    var kickTarget by remember { mutableStateOf<ServerMember?>(null) }
    var kicking by remember { mutableStateOf(false) }
    var kickError by remember { mutableStateOf<String?>(null) }
    var permissions by remember(server.id) { mutableStateOf<Map<String, Boolean>>(emptyMap()) }
    // Current user's role gates kick visibility — RLS enforces it anyway,
    // but hiding the button for plain members avoids a guaranteed failure.
    val selfId = remember { com.wsgpolar.disband.core.DisbandSupabase.auth.currentSessionOrNull()?.user?.id }

    suspend fun load() {
        loading = true
        loadError = null
        try {
            members = Database.members(server.id)
        } catch (e: Exception) {
            loadError = e.message ?: e.toString()
        }
        loading = false
    }

    LaunchedEffect(server.id) {
        launch { com.wsgpolar.disband.data.ServerRoster.load(server.id) }
        launch { permissions = ServerAdmin.permissions(server.id) }
        load()
    }
    val rosters by com.wsgpolar.disband.data.ServerRoster.rosters.collectAsState()
    val roster = rosters[server.id]
    val statuses by (presence ?: remember { kotlinx.coroutines.flow.MutableStateFlow(emptyMap()) }).collectAsState()
    val liveProfiles by com.wsgpolar.disband.data.ProfileStore.profiles.collectAsState()
    // Everyone listed here gets their profile edits (status, name) live.
    LaunchedEffect(members) {
        com.wsgpolar.disband.data.ProfileStore.watch("members:${server.id}", members.map { it.userId })
    }
    androidx.compose.runtime.DisposableEffect(server.id) {
        onDispose { com.wsgpolar.disband.data.ProfileStore.unwatch("members:${server.id}") }
    }
    var profileFor by remember { mutableStateOf<com.wsgpolar.disband.data.Profile?>(null) }
    profileFor?.let { com.wsgpolar.disband.ui.chat.UserProfileSheet(initial = it, serverId = server.id, onDismiss = { profileFor = null }) }

    val selfRole = members.firstOrNull { it.userId == selfId }?.role
    // Custom roles can grant kick without the legacy moderator role. Keep the
    // legacy fallback so a failed permission RPC does not hide a working
    // action from an existing moderator.
    val canModerate = permissions["kick"] == true ||
        selfRole == MemberRole.Owner || selfRole == MemberRole.Admin || selfRole == MemberRole.Moderator
    val needle = query.trim().lowercase()
    // servers.owner_id decides the owner over a stale role column (web `withOwner`).
    val resolved = members.map { m ->
        val p = m.profile?.let { liveProfiles[it.id] ?: it } ?: liveProfiles[m.userId]
        val role = when {
            m.userId == server.ownerId -> MemberRole.Owner
            m.role == MemberRole.Owner -> MemberRole.Member
            else -> m.role
        }
        m.copy(profile = p, role = role)
    }
    val visible = if (needle.isBlank()) resolved else resolved.filter {
        (it.profile?.name ?: "").lowercase().contains(needle) ||
            (it.profile?.username ?: "").lowercase().contains(needle)
    }
    val groups = remember(visible, roster, statuses) { hoistMembers(visible, roster, statuses) }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = palette.surface,
    ) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding()) {
            Text(
                "Members", color = palette.textPrimary, fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(horizontal = 20.dp),
            )
            Text(
                if (loading) "Loading…" else "${members.size} in ${server.name}",
                color = palette.textMuted, fontSize = 13.sp,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp),
            )
            com.wsgpolar.disband.ui.components.CapsuleSearchField(
                text = query,
                onValueChange = { query = it },
                prompt = "Search members",
                modifier = Modifier.padding(top = 4.dp, bottom = 4.dp),
            )

            when {
                loading -> Box(Modifier.fillMaxWidth().height(160.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = palette.accent)
                }
                loadError != null -> com.wsgpolar.disband.ui.components.ErrorState(
                    message = loadError ?: "Unknown error",
                    onRetry = { scope.launch { load() } },
                )
                visible.isEmpty() -> Box(
                    Modifier.fillMaxWidth().padding(24.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        if (query.isBlank()) "No members yet." else "No one matches \"$query\".",
                        color = palette.textMuted, fontSize = 14.sp,
                    )
                }
                else -> LazyColumn(Modifier.fillMaxWidth().heightIn(max = 520.dp)) {
                    for (group in groups) {
                        item(key = "h:${group.label}") {
                            Text(
                                "${group.label.uppercase()} — ${group.members.size}",
                                color = palette.textMuted, fontSize = 12.sp, fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(start = 20.dp, end = 20.dp, top = 12.dp, bottom = 4.dp),
                            )
                        }
                    items(group.members, key = { it.id }) { member ->
                        val offline = group.offline
                        val status = statuses[member.userId] ?: com.wsgpolar.disband.data.UserStatus.Offline
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .clickable { member.profile?.let { profileFor = it } ?: run { profileFor = com.wsgpolar.disband.data.Profile(id = member.userId) } }
                                .padding(horizontal = 20.dp, vertical = 8.dp)
                                .then(if (offline) Modifier.alpha(0.45f) else Modifier),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            AvatarImage(
                                url = member.profile?.avatarUrl,
                                name = member.profile?.name ?: "?",
                                size = 38.dp,
                                presence = if (offline) null else status.color(palette),
                                ring = palette.surface,
                            )
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    // Top role colour (and gradient), unless their
                                    // own Aero name colour wins, as on the web.
                                    com.wsgpolar.disband.ui.components.DisplayNameText(
                                        member.profile,
                                        fontSize = 15.sp, fontWeight = FontWeight.Medium,
                                        role = roster?.topRole(member.userId, member.roleId),
                                        roleGradient = true,
                                        modifier = Modifier.weight(1f, fill = false),
                                    )
                                    roster?.iconRole(member.userId, member.roleId)?.let {
                                        Spacer(Modifier.width(4.dp))
                                        com.wsgpolar.disband.ui.components.RoleIcon(it.icon, 15)
                                    }
                                    if (member.role == MemberRole.Owner) {
                                        Spacer(Modifier.width(4.dp))
                                        Icon(Icons.Filled.WorkspacePremium, contentDescription = "Space owner",
                                            tint = Color(0xFFF0B232), modifier = Modifier.size(14.dp))
                                    } else if (member.role == MemberRole.Admin) {
                                        Spacer(Modifier.width(4.dp))
                                        Icon(Icons.Filled.Shield, contentDescription = "Admin",
                                            tint = palette.textMuted, modifier = Modifier.size(14.dp))
                                    }
                                }
                                val sub = member.profile?.activeStatusNote ?: member.profile?.username?.let { "@$it" }
                                sub?.let {
                                    Text(it, color = palette.textMuted, fontSize = 12.sp,
                                        maxLines = 1, overflow = TextOverflow.Ellipsis)
                                }
                            }
                            if (canModerate && member.userId != selfId && member.role != MemberRole.Owner) {
                                androidx.compose.material3.IconButton(
                                    onClick = {
                                        kickError = null
                                        kickTarget = member
                                    },
                                    modifier = Modifier.size(48.dp),
                                ) {
                                    Icon(
                                        Icons.Filled.Close,
                                        contentDescription = "Remove ${member.profile?.name ?: "member"}",
                                        tint = Brand.dnd,
                                        modifier = Modifier.size(20.dp),
                                    )
                                }
                            }
                        }
                    }
                    }
                }
            }
            Spacer(Modifier.height(16.dp))
        }
    }

    kickTarget?.let { target ->
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { if (!kicking) kickTarget = null },
            title = { Text("Remove ${target.profile?.name ?: "member"}?") },
            text = {
                Text(
                    kickError
                        ?: "They'll need a new invite to rejoin ${server.name}."
                )
            },
            confirmButton = {
                androidx.compose.material3.TextButton(
                    onClick = {
                        kicking = true
                        kickError = null
                        scope.launch {
                            try {
                                Database.kickMember(server.id, target.userId)
                                kickTarget = null
                                load()
                            } catch (e: kotlinx.coroutines.CancellationException) {
                                throw e
                            } catch (_: Exception) {
                                // Rank and permission are enforced server-side;
                                // say so instead of closing as if it worked.
                                kickError = "Couldn't remove this member. They may rank above you, or you may not have permission."
                            } finally {
                                kicking = false
                            }
                        }
                    },
                    enabled = !kicking,
                ) { Text(if (kicking) "Removing…" else "Remove", color = Brand.dnd) }
            },
            dismissButton = {
                androidx.compose.material3.TextButton(
                    onClick = { kickTarget = null },
                    enabled = !kicking,
                ) { Text("Cancel") }
            },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ServerOverflowSheet(
    app: AppState,
    server: Server,
    onDismiss: () -> Unit,
    onLeft: () -> Unit,
    onOpenSettings: () -> Unit,
) {
    val palette = LocalPalette.current
    val context = LocalContext.current
    val scope = rememberCoroutineScopeCompat()
    var leaving by remember { mutableStateOf(false) }
    var leaveError by remember { mutableStateOf<String?>(null) }
    var confirmLeave by remember { mutableStateOf(false) }
    var showNotify by remember { mutableStateOf(false) }
    if (showNotify) SpaceNotificationsSheet(server) { showNotify = false; onDismiss() }
    val uid = app.currentUserId
    val isOwner = server.ownerId == uid
    var permissions by remember(server.id) { mutableStateOf<Map<String, Boolean>>(emptyMap()) }
    LaunchedEffect(server.id) { permissions = ServerAdmin.permissions(server.id) }
    val canOpenSettings = isOwner || RolePermissionCatalogue.settingsKeys.any { permissions[it] == true }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = palette.surface,
    ) {
        Column(Modifier.padding(bottom = 28.dp).navigationBarsPadding()) {
            Text(
                server.name, color = palette.textPrimary, fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(horizontal = 20.dp),
            )
            Spacer(Modifier.height(14.dp))

            if (canOpenSettings) {
                OverflowRow("Space Settings", Icons.Filled.Settings, palette) {
                    onDismiss()
                    onOpenSettings()
                }
            }

            OverflowRow("Notification settings", Icons.Filled.Notifications, palette) {
                showNotify = true
            }

            // The web's "Mark as read": every channel and every ping in the space.
            OverflowRow("Mark as read", Icons.Filled.DoneAll, palette) {
                com.wsgpolar.disband.data.ChannelUnreads.markServerRead(server.id)
                onDismiss()
            }

            server.inviteUrl?.let { link ->
                OverflowRow("Copy invite link", Icons.Filled.ContentCopy, palette) {
                    copyToClipboard(context, link)
                    onDismiss()
                }
            }

            // The owner leaving would orphan the space, so it is not offered —
            // the web deletes instead, which is a bigger action than a sheet
            // like this should carry.
            if (!isOwner && uid != null) {
                OverflowRow(
                    if (leaving) "Leaving…" else "Leave space",
                    Icons.AutoMirrored.Filled.Logout,
                    palette,
                    tint = Brand.danger,
                ) {
                    if (!leaving) {
                        leaveError = null
                        confirmLeave = true
                    }
                }
            }
        }
    }

    if (confirmLeave && uid != null) {
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { if (!leaving) confirmLeave = false },
            title = { Text("Leave ${server.name}?") },
            text = {
                Text(
                    leaveError
                        ?: "You'll need a new invite to rejoin."
                )
            },
            confirmButton = {
                androidx.compose.material3.TextButton(
                    onClick = {
                        leaving = true
                        leaveError = null
                        scope.launch {
                            try {
                                Database.leaveServer(server.id, uid)
                                app.loadServers()
                                confirmLeave = false
                                onDismiss()
                                onLeft()
                            } catch (e: kotlinx.coroutines.CancellationException) {
                                throw e
                            } catch (_: Exception) {
                                // The DELETE is the whole operation. Reporting
                                // success without it removed the space locally
                                // and then brought it back on the next load.
                                leaveError = "Couldn't leave this space. Check your connection and try again."
                            } finally {
                                leaving = false
                            }
                        }
                    },
                    enabled = !leaving,
                ) { Text(if (leaving) "Leaving…" else "Leave", color = Brand.dnd) }
            },
            dismissButton = {
                androidx.compose.material3.TextButton(
                    onClick = { confirmLeave = false },
                    enabled = !leaving,
                ) { Text("Cancel") }
            },
        )
    }
}

@Composable
private fun OverflowRow(
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    palette: com.wsgpolar.disband.core.Palette,
    tint: androidx.compose.ui.graphics.Color = palette.textPrimary,
    onClick: () -> Unit,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 52.dp)
            .clickable(
                role = androidx.compose.ui.semantics.Role.Button,
                onClickLabel = label,
                onClick = onClick,
            )
            .padding(horizontal = 20.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(14.dp))
        Text(label, color = tint, fontSize = 15.sp, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun SheetAction(
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    modifier: Modifier,
    palette: com.wsgpolar.disband.core.Palette,
    onClick: () -> Unit,
) {
    Row(
        modifier
            .clip(RoundedCornerShape(12.dp))
            .background(palette.elevated)
            .clickable(onClick = onClick)
            .padding(vertical = 13.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = palette.accent, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(8.dp))
        Text(label, color = palette.textPrimary, fontSize = 14.sp, fontWeight = FontWeight.Medium)
    }
}

private fun copyToClipboard(context: Context, text: String) {
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    clipboard.setPrimaryClip(ClipData.newPlainText("Disband invite", text))
}

/** Local alias so the import list stays readable. */
@Composable
private fun rememberCoroutineScopeCompat() = androidx.compose.runtime.rememberCoroutineScope()

/** One heading in the member list and who sits under it. */
internal data class MemberGroup(val label: String, val members: List<ServerMember>, val offline: Boolean = false)

/**
 * The web's member list grouping (`MemberList.tsx`): online members by their
 * top role (every role hoists; Owner and Admin are built in), groups ordered
 * Owner, Admin, then by the group's highest role position, then A to Z; names
 * A to Z inside a group; everyone offline in one group at the end.
 */
internal fun hoistMembers(
    members: List<ServerMember>,
    roster: com.wsgpolar.disband.data.ServerRoster.Roster?,
    statuses: Map<String, com.wsgpolar.disband.data.UserStatus>,
): List<MemberGroup> {
    fun online(m: ServerMember): Boolean {
        val s = statuses[m.userId] ?: com.wsgpolar.disband.data.UserStatus.Offline
        return s != com.wsgpolar.disband.data.UserStatus.Offline
    }
    // Close to JavaScript's localeCompare, which the web sorts with.
    val collator = java.text.Collator.getInstance()
    val byName = Comparator<ServerMember> { a, b ->
        collator.compare(a.profile?.name ?: "", b.profile?.name ?: "").takeIf { it != 0 } ?: a.userId.compareTo(b.userId)
    }
    val (on, off) = members.partition(::online)
    fun label(m: ServerMember): String = when {
        m.role == MemberRole.Owner -> "Owner"
        else -> roster?.topRole(m.userId, m.roleId)?.name ?: if (m.role == MemberRole.Admin) "Admin" else "Online"
    }
    val grouped = on.groupBy(::label)
    fun priority(label: String): Int = when (label) {
        "Owner" -> Int.MAX_VALUE
        "Admin" -> Int.MAX_VALUE - 1
        else -> grouped[label].orEmpty().maxOfOrNull { roster?.topRole(it.userId, it.roleId)?.position ?: -1 } ?: -1
    }
    val out = grouped.keys.sortedWith(compareByDescending<String> { priority(it) }.thenBy { it })
        .map { MemberGroup(it, grouped.getValue(it).sortedWith(byName)) }
        .toMutableList()
    if (off.isNotEmpty()) out += MemberGroup("Offline", off.sortedWith(byName), offline = true)
    return out
}
