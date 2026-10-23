package com.wsgpolar.disband.ui.main

import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Tag
import androidx.compose.material.icons.filled.Campaign
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import com.wsgpolar.disband.core.Brand
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.core.TimeFormat
import com.wsgpolar.disband.core.seeded
import com.wsgpolar.disband.data.Channel
import com.wsgpolar.disband.data.ChannelCategory
import com.wsgpolar.disband.data.ChannelType
import com.wsgpolar.disband.data.Database
import com.wsgpolar.disband.data.MediaService
import com.wsgpolar.disband.data.MemberRole
import com.wsgpolar.disband.data.Profile
import com.wsgpolar.disband.data.Server
import com.wsgpolar.disband.data.ServerAdmin
import com.wsgpolar.disband.data.ServerMember
import com.wsgpolar.disband.state.AppState
import com.wsgpolar.disband.ui.AvatarImage
import com.wsgpolar.disband.ui.collectAsStateValue
import com.wsgpolar.disband.ui.components.CapsuleSearchField
import com.wsgpolar.disband.ui.components.SectionCaption
import com.wsgpolar.disband.ui.components.SettingsDivider
import com.wsgpolar.disband.ui.components.SettingsGroup
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * The web's role permission groups (`PERM_GROUPS` in RoleManager.tsx), with
 * the same labels and hints so a role reads the same on every client.
 */
object RolePermissionCatalogue {
    data class Permission(val key: String, val label: String, val hint: String)
    data class Group(val title: String, val permissions: List<Permission>)

    val groups = listOf(
        Group("Moderation", listOf(
            Permission("kick", "Kick members", "Remove people from the space. They can come back with an invite."),
            Permission("ban", "Ban members", "Remove people for good and manage the ban list."),
            Permission("timeout_members", "Time out members", "Stop someone posting for a while."),
            Permission("manage_messages", "Manage messages", "Delete anyone's messages."),
            Permission("pin_messages", "Pin messages", "Pin messages to a channel."),
            Permission("mention_everyone", "Mention @everyone", "Ping the whole space with @everyone and @here."),
        )),
        Group("Messages", listOf(
            Permission("send_messages", "Send messages", "Post in text channels."),
            Permission("add_reactions", "Add reactions", "React to messages."),
            Permission("attach_files", "Attach files", "Upload images and files."),
        )),
        Group("Management", listOf(
            Permission("manage_roles", "Manage roles", "Create roles below their own and assign them."),
            Permission("manage_channels", "Manage channels", "Create, edit and delete channels."),
            Permission("manage_server", "Manage space", "Edit the space's settings and invites."),
            Permission("create_invites", "Create invites", "Share invite links."),
            Permission("manage_emojis", "Manage emoji", "Add and remove custom emoji and sounds."),
            Permission("manage_webhooks", "Manage webhooks", "Create, edit and delete webhooks."),
            Permission("view_audit_log", "View audit log", "See who did what."),
        )),
    )

    /** All @everyone may be given; the rest stay off it, as on the web. */
    val everyoneAllowed = setOf("send_messages", "add_reactions", "attach_files")

    /** The web's `ROLE_COLORS`. */
    val colours = listOf("#5865f2", "#57f287", "#fee75c", "#eb459e", "#ed4245",
        "#e67e22", "#9b59b6", "#1abc9c", "#95a5ba", "#ffffff")

    /** Every permission a Space Settings page needs; holding any opens it. */
    val settingsKeys = listOf("manage_server", "manage_channels", "manage_roles", "kick", "ban",
        "timeout_members", "view_audit_log")
}

private sealed interface Page {
    data object Home : Page
    data object Overview : Page
    data object Members : Page
    data class Member(val profile: Profile) : Page
    data object Roles : Page
    data class RoleEdit(val role: ServerAdmin.Role) : Page
    data object Bans : Page
    data object Channels : Page
    data class ChannelEdit(val channel: Channel) : Page
    data object Audit : Page
}

/**
 * Space Settings: the phone's version of the web's settings modal, page by
 * page, each shown only to someone holding the permission the web asks for.
 * Android had nothing here — the space menu offered copy-invite and leave.
 */
@Composable
fun SpaceSettingsScreen(
    app: AppState,
    server: Server,
    onDismiss: () -> Unit,
    onDeleted: () -> Unit,
    /** Channels or categories changed: the panel behind should reload. */
    onChannelsChanged: () -> Unit,
) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            decorFitsSystemWindows = false,
            dismissOnBackPress = false,
        ),
    ) {
        val palette = LocalPalette.current
        val stack = remember { mutableStateListOf<Page>(Page.Home) }
        var permissions by remember { mutableStateOf<Map<String, Boolean>>(emptyMap()) }
        LaunchedEffect(server.id) { permissions = ServerAdmin.permissions(server.id) }

        val isOwner = server.ownerId == app.currentUserId
        val can: (String) -> Boolean = { key -> isOwner || permissions[key] == true }
        val push: (Page) -> Unit = { stack.add(it) }
        val pop: () -> Unit = { if (stack.size > 1) stack.removeAt(stack.lastIndex) else onDismiss() }
        BackHandler { pop() }

        Box(
            Modifier
                .fillMaxSize()
                .background(palette.background)
                .systemBarsPadding()
                .imePadding(),
        ) {
            AnimatedContent(
                targetState = stack.last(),
                transitionSpec = {
                    (slideInHorizontally { it / 5 } + fadeIn()) togetherWith (slideOutHorizontally { -it / 8 } + fadeOut())
                },
                label = "spaceSettingsPage",
            ) { page ->
                when (page) {
                    Page.Home -> HomePage(app, server, isOwner, can, push, onClose = onDismiss, onDeleted = {
                        onDismiss()
                        onDeleted()
                    })
                    Page.Overview -> OverviewPage(app, server, editable = isOwner, onBack = pop)
                    Page.Members -> MembersPage(server, push, onBack = pop)
                    is Page.Member -> MemberPage(app, server, page.profile, can, onBack = pop)
                    Page.Roles -> RolesPage(server.id, push, onBack = pop)
                    is Page.RoleEdit -> RoleEditPage(page.role, onBack = pop)
                    Page.Bans -> BansPage(server.id, onBack = pop)
                    Page.Channels -> ChannelsPage(server, push, onChanged = onChannelsChanged, onBack = pop)
                    is Page.ChannelEdit -> ChannelEditPage(page.channel, onChanged = onChannelsChanged, onBack = pop)
                    Page.Audit -> AuditPage(server.id, onBack = pop)
                }
            }
        }
    }
}

// MARK: - Home

@Composable
private fun HomePage(
    app: AppState,
    server: Server,
    isOwner: Boolean,
    can: (String) -> Boolean,
    push: (Page) -> Unit,
    onClose: () -> Unit,
    onDeleted: () -> Unit,
) {
    val palette = LocalPalette.current
    val scope = rememberCoroutineScope()
    var showInvite by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    var deleteName by remember { mutableStateOf("") }
    var deleting by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val canSeeMembers = can("manage_roles") || can("kick") || can("ban") || can("timeout_members")

    Column(Modifier.fillMaxSize()) {
        PageBar("Space Settings", onBack = onClose, backIcon = Icons.Filled.Close)
        LazyColumn(contentPadding = PaddingValues(bottom = 40.dp)) {
            item {
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    AvatarImage(url = server.iconUrl, name = server.name, size = 52.dp)
                    Spacer(Modifier.width(14.dp))
                    Column(Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(server.name, color = palette.textPrimary, fontSize = 18.sp, fontWeight = FontWeight.SemiBold,
                                maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                            SpaceBadge(verified = server.verified, partner = server.partner)
                        }
                        Text(
                            if (isOwner) "You own this space" else "You can manage parts of this space",
                            color = palette.textMuted, fontSize = 14.sp,
                        )
                    }
                }
            }
            group("Space") {
                NavRow(Icons.Filled.Info, "Overview") { push(Page.Overview) }
                SettingsDivider()
                NavRow(Icons.Filled.Link, "Invites") { showInvite = true }
            }
            if (canSeeMembers || can("ban")) {
                group("People") {
                    var first = true
                    if (canSeeMembers) {
                        NavRow(Icons.Filled.Groups, "Members") { push(Page.Members) }
                        first = false
                    }
                    if (can("manage_roles")) {
                        if (!first) SettingsDivider()
                        NavRow(Icons.Filled.Shield, "Roles") { push(Page.Roles) }
                        first = false
                    }
                    if (can("ban")) {
                        if (!first) SettingsDivider()
                        NavRow(Icons.Filled.Block, "Bans") { push(Page.Bans) }
                    }
                }
            }
            if (can("manage_channels")) {
                group("Content") { NavRow(Icons.Filled.Tag, "Channels") { push(Page.Channels) } }
            }
            if (can("view_audit_log")) {
                group("Moderation") { NavRow(Icons.AutoMirrored.Filled.List, "Audit Log") { push(Page.Audit) } }
            }
            if (isOwner) {
                item { Spacer(Modifier.height(18.dp)) }
                item {
                    SettingsGroup {
                        ActionRow(if (deleting) "Deleting…" else "Delete Space", tint = Brand.danger, enabled = !deleting) {
                            deleteName = ""
                            confirmDelete = true
                        }
                    }
                    Footnote(error ?: "Removes every channel and message for everyone. This can't be undone.",
                        isError = error != null)
                }
            }
        }
    }

    if (showInvite) InviteSheet(server = server, onDismiss = { showInvite = false })

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { if (!deleting) confirmDelete = false },
            title = { Text("Delete ${server.name}?") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Type the space's name to confirm. Every channel and message goes with it.")
                    SettingsField(deleteName, { deleteName = it }, placeholder = server.name, capitalise = false, padded = false)
                }
            },
            confirmButton = {
                TextButton(
                    enabled = !deleting && deleteName.trim() == server.name,
                    onClick = {
                        deleting = true
                        scope.launch {
                            try {
                                ServerAdmin.deleteServer(server.id)
                                app.loadServers()
                                confirmDelete = false
                                onDeleted()
                            } catch (e: Exception) {
                                error = e.message ?: "Couldn't delete the space."
                                confirmDelete = false
                            } finally {
                                deleting = false
                            }
                        }
                    },
                ) { Text("Delete", color = Brand.dnd) }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = false }, enabled = !deleting) { Text("Cancel") } },
        )
    }
}

// MARK: - Overview

@Composable
private fun OverviewPage(app: AppState, server: Server, editable: Boolean, onBack: () -> Unit) {
    val palette = LocalPalette.current
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    var name by remember { mutableStateOf(server.name) }
    var description by remember { mutableStateOf(server.description ?: "") }
    var iconUrl by remember { mutableStateOf<String?>(null) }
    var bannerUrl by remember { mutableStateOf<String?>(null) }
    var uploading by remember { mutableStateOf<String?>(null) }
    var discoverable by remember { mutableStateOf(false) }
    var discoverableLoaded by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(server.id) {
        discoverable = ServerAdmin.isDiscoverable(server.id)
        discoverableLoaded = true
    }

    fun upload(uri: Uri?, banner: Boolean) {
        if (uri == null) return
        uploading = if (banner) "banner" else "icon"
        scope.launch {
            try {
                val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                    ?: error("Unreadable image")
                val mime = context.contentResolver.getType(uri) ?: "image/jpeg"
                val url = MediaService.uploadImage(bytes, filename = if (banner) "banner" else "icon", mimeType = mime).url
                if (banner) bannerUrl = url else iconUrl = url
                error = null
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (_: Exception) {
                error = "That image couldn't be uploaded. Try another."
            } finally {
                uploading = null
            }
        }
    }

    val pickIcon = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { upload(it, banner = false) }
    val pickBanner = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { upload(it, banner = true) }
    val imageOnly = PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)

    val dirty = name.trim() != server.name || description.trim() != (server.description ?: "") ||
        iconUrl != null || bannerUrl != null
    val canSave = editable && dirty && !busy && uploading == null && name.isNotBlank()

    Column(Modifier.fillMaxSize()) {
        PageBar("Overview", onBack = onBack) {
            if (editable) {
                SaveButton(busy = busy, enabled = canSave) {
                    busy = true
                    scope.launch {
                        try {
                            Database.updateServer(
                                server.id,
                                name = name.trim(),
                                description = description.trim(),
                                iconUrl = iconUrl,
                                bannerUrl = bannerUrl,
                            )
                            app.loadServers()
                            onBack()
                        } catch (e: Exception) {
                            error = e.message ?: "Couldn't save."
                        } finally {
                            busy = false
                        }
                    }
                }
            }
        }
        LazyColumn(contentPadding = PaddingValues(bottom = 40.dp)) {
            item {
                // The space as it will look: banner with the icon over its edge.
                Column(
                    Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                        .clip(RoundedCornerShape(16.dp)).background(palette.surface),
                ) {
                    Box(
                        Modifier.fillMaxWidth().height(112.dp)
                            .clickable(enabled = editable && uploading == null, onClickLabel = "Change banner") {
                                pickBanner.launch(imageOnly)
                            },
                    ) {
                        val banner = bannerUrl ?: server.bannerUrl
                        if (!banner.isNullOrBlank()) {
                            AsyncImage(model = banner, contentDescription = null, contentScale = ContentScale.Crop,
                                modifier = Modifier.fillMaxSize())
                        } else {
                            Box(Modifier.fillMaxSize().background(
                                Brush.linearGradient(listOf(Color.seeded(server.id), Color.seeded(server.id + "2"))),
                            ))
                        }
                        if (uploading == "banner") {
                            Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.35f)), contentAlignment = Alignment.Center) {
                                CircularProgressIndicator(color = Color.White, modifier = Modifier.size(24.dp))
                            }
                        }
                        if (editable) Pip(Modifier.align(Alignment.TopEnd).padding(10.dp))
                    }
                    Row(Modifier.padding(start = 14.dp, end = 14.dp, bottom = 14.dp), verticalAlignment = Alignment.Bottom) {
                        Box(
                            Modifier
                                .size(80.dp)
                                .clip(CircleShape)
                                .background(palette.surface)
                                .padding(4.dp)
                                .clickable(enabled = editable && uploading == null, onClickLabel = "Change icon") {
                                    pickIcon.launch(imageOnly)
                                },
                        ) {
                            AvatarImage(url = iconUrl ?: server.iconUrl, name = name.ifBlank { server.name }, size = 72.dp)
                            if (uploading == "icon") {
                                CircularProgressIndicator(color = palette.accent, modifier = Modifier.align(Alignment.Center).size(22.dp))
                            } else if (editable) {
                                Pip(Modifier.align(Alignment.BottomEnd))
                            }
                        }
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.padding(bottom = 6.dp)) {
                            Text(name.ifBlank { server.name }, color = palette.textPrimary, fontSize = 16.sp,
                                fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(description.ifBlank { "No description yet" }, color = palette.textMuted, fontSize = 12.sp,
                                maxLines = 2, overflow = TextOverflow.Ellipsis)
                        }
                    }
                }
                if (editable) Footnote("Tap the banner or icon to change them.")
            }
            item {
                SectionCaption("Name")
                SettingsField(name, { name = it.take(100) }, placeholder = "Space name", enabled = editable)
            }
            item {
                SectionCaption("Description")
                SettingsField(description, { description = it.take(1000) }, placeholder = "What's this space about?",
                    enabled = editable, singleLine = false)
                Footnote("Shown to people who find this space through Discover.")
            }
            item {
                Spacer(Modifier.height(8.dp))
                SettingsGroup {
                    ToggleRow(
                        title = "Show in Discover",
                        checked = discoverable,
                        enabled = editable && discoverableLoaded,
                    ) { on ->
                        val before = discoverable
                        discoverable = on
                        scope.launch {
                            runCatching { ServerAdmin.setDiscoverable(server.id, on) }
                                .onFailure { discoverable = before; error = it.message ?: "Couldn't change that." }
                        }
                    }
                }
                Footnote(if (editable) "Anyone can find and join a space that's in Discover." else "Only the owner can change these.")
            }
            error?.let { item { Footnote(it, isError = true) } }
        }
    }
}

@Composable
private fun Pip(modifier: Modifier) {
    val palette = LocalPalette.current
    Box(modifier.size(24.dp).clip(CircleShape).background(palette.accent), contentAlignment = Alignment.Center) {
        Icon(Icons.Filled.CameraAlt, contentDescription = null, tint = Color.White, modifier = Modifier.size(13.dp))
    }
}

// MARK: - Members

@Composable
private fun MembersPage(server: Server, push: (Page) -> Unit, onBack: () -> Unit) {
    val palette = LocalPalette.current
    var members by remember { mutableStateOf<List<ServerMember>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<Profile>?>(null) }

    LaunchedEffect(server.id) {
        members = runCatching { Database.members(server.id) }.getOrDefault(members)
        loading = false
    }
    LaunchedEffect(query) {
        val q = query.trim()
        if (q.isEmpty()) { results = null; return@LaunchedEffect }
        delay(250)
        results = ServerAdmin.searchMembers(server.id, q)
    }

    val rank = mapOf(MemberRole.Owner to 0, MemberRole.Admin to 1, MemberRole.Moderator to 2, MemberRole.Member to 3)
    val sorted = remember(members) {
        members.sortedWith(compareBy<ServerMember> { rank[it.role] ?: 3 }.thenBy { (it.profile?.name ?: "").lowercase() })
    }
    val roleOf = remember(members) { members.associate { it.userId to it.role } }

    Column(Modifier.fillMaxSize()) {
        PageBar("Members", onBack = onBack)
        CapsuleSearchField(text = query, onValueChange = { query = it }, prompt = "Search members")
        Spacer(Modifier.height(8.dp))
        LazyColumn(contentPadding = PaddingValues(bottom = 40.dp)) {
            val shown = results
            when {
                shown != null && shown.isEmpty() -> item { Footnote("No one matches “${query.trim()}”.") }
                shown != null -> group(null) {
                    shown.forEachIndexed { i, profile ->
                        if (i > 0) SettingsDivider()
                        MemberRow(profile, roleOf[profile.id]) { push(Page.Member(profile)) }
                    }
                }
                loading -> item { LoadingBlock() }
                else -> group("${members.size} ${if (members.size == 1) "member" else "members"}") {
                    sorted.forEachIndexed { i, member ->
                        val profile = member.profile ?: return@forEachIndexed
                        if (i > 0) SettingsDivider()
                        MemberRow(profile, member.role) { push(Page.Member(profile)) }
                    }
                }
            }
        }
    }
}

@Composable
private fun MemberRow(profile: Profile, role: MemberRole?, onClick: () -> Unit) {
    val palette = LocalPalette.current
    Row(
        Modifier.fillMaxWidth().clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AvatarImage(url = profile.avatarUrl, name = profile.name, size = 40.dp)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(profile.name, color = palette.textPrimary, fontSize = 15.sp, fontWeight = FontWeight.SemiBold,
                maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text("@${profile.handle}", color = palette.textMuted, fontSize = 13.sp, maxLines = 1)
        }
        if (role != null && role != MemberRole.Member) {
            val tint = if (role == MemberRole.Owner) Brand.idle else palette.accent
            Text(
                role.name,
                color = tint, fontSize = 11.sp, fontWeight = FontWeight.SemiBold,
                modifier = Modifier.clip(CircleShape).background(tint.copy(alpha = 0.18f)).padding(horizontal = 8.dp, vertical = 3.dp),
            )
            Spacer(Modifier.width(6.dp))
        }
        Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = palette.textMuted)
    }
}

private val TimeoutChoices = listOf(
    "60 seconds" to 60, "5 minutes" to 300, "10 minutes" to 600,
    "1 hour" to 3600, "1 day" to 86_400, "1 week" to 604_800,
)

@Composable
private fun MemberPage(
    app: AppState,
    server: Server,
    profile: Profile,
    can: (String) -> Boolean,
    onBack: () -> Unit,
) {
    val palette = LocalPalette.current
    val scope = rememberCoroutineScope()
    var memberRole by remember { mutableStateOf<String?>(null) }
    var roles by remember { mutableStateOf<List<ServerAdmin.Role>>(emptyList()) }
    var roleIds by remember { mutableStateOf<Set<String>>(emptySet()) }
    var timeoutEnds by remember { mutableStateOf<Long?>(null) }
    var loading by remember { mutableStateOf(true) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var dialog by remember { mutableStateOf<String?>(null) }
    var reason by remember { mutableStateOf("") }
    var seconds by remember { mutableStateOf(600) }

    LaunchedEffect(profile.id) {
        val detail = ServerAdmin.memberDetail(server.id, profile.id)
        memberRole = detail?.role
        roleIds = detail?.roleIds?.toSet() ?: emptySet()
        roles = runCatching { ServerAdmin.roles(server.id) }.getOrDefault(emptyList())
        timeoutEnds = ServerAdmin.timeoutEnds(server.id, profile.id)
        loading = false
    }

    val isOwnerRow = memberRole == "owner" || profile.id == server.ownerId
    val isSelf = profile.id == app.currentUserId
    val canAct = !isOwnerRow && !isSelf
    val assignable = roles.filter { it.isDefault != true }

    fun run(work: suspend () -> Unit) {
        busy = true
        error = null
        scope.launch {
            try { work() } catch (e: kotlinx.coroutines.CancellationException) { throw e }
            catch (e: Exception) { error = e.message ?: "That didn't work." }
            finally { busy = false }
        }
    }

    Column(Modifier.fillMaxSize()) {
        PageBar(profile.name, onBack = onBack)
        LazyColumn(contentPadding = PaddingValues(bottom = 40.dp)) {
            item {
                Row(Modifier.padding(horizontal = 20.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    AvatarImage(url = profile.avatarUrl, name = profile.name, size = 56.dp)
                    Spacer(Modifier.width(14.dp))
                    Column {
                        Text(profile.name, color = palette.textPrimary, fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
                        Text("@${profile.handle}", color = palette.textMuted, fontSize = 14.sp)
                    }
                }
            }
            if (loading) item { LoadingBlock() }
            if (!loading && can("manage_roles") && assignable.isNotEmpty()) {
                group("Roles") {
                    assignable.forEachIndexed { i, role ->
                        if (i > 0) SettingsDivider()
                        ToggleRow(
                            title = role.name,
                            leading = { ColourDot(role.color) },
                            checked = role.id in roleIds,
                            enabled = !busy,
                        ) { on ->
                            val before = roleIds
                            roleIds = if (on) roleIds + role.id else roleIds - role.id
                            scope.launch {
                                runCatching { ServerAdmin.setMemberRoles(server.id, profile.id, roleIds.toList()) }
                                    .onFailure { roleIds = before; error = it.message ?: "Couldn't change roles." }
                            }
                        }
                    }
                }
                item { Footnote("You can only hand out roles below your own highest role.") }
            }
            if (!loading && canAct && (can("timeout_members") || can("kick") || can("ban"))) {
                group("Moderation") {
                    var first = true
                    if (can("timeout_members")) {
                        val ends = timeoutEnds
                        if (ends != null) {
                            ActionRow("Remove timeout (until ${TimeFormat.short(java.time.Instant.ofEpochMilli(ends).toString())})",
                                enabled = !busy) {
                                run { ServerAdmin.removeTimeout(server.id, profile.id); timeoutEnds = null }
                            }
                        } else {
                            ActionRow("Time out", enabled = !busy) { reason = ""; seconds = 600; dialog = "timeout" }
                        }
                        first = false
                    }
                    if (can("kick")) {
                        if (!first) SettingsDivider()
                        ActionRow("Kick", tint = Brand.danger, enabled = !busy) { dialog = "kick" }
                        first = false
                    }
                    if (can("ban")) {
                        if (!first) SettingsDivider()
                        ActionRow("Ban", tint = Brand.danger, enabled = !busy) { reason = ""; dialog = "ban" }
                    }
                }
            } else if (!loading && isOwnerRow) {
                item { Footnote("The owner can't be moderated.") }
            }
            error?.let { item { Footnote(it, isError = true) } }
        }
    }

    when (dialog) {
        "timeout" -> AlertDialog(
            onDismissRequest = { dialog = null },
            title = { Text("Time out ${profile.name}?") },
            text = {
                Column {
                    Text("They can read but can't post, react or join voice until it ends.", color = palette.textMuted, fontSize = 14.sp)
                    Spacer(Modifier.height(8.dp))
                    TimeoutChoices.forEach { (label, value) ->
                        Row(
                            Modifier.fillMaxWidth().clickable { seconds = value }.padding(vertical = 2.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            RadioButton(selected = seconds == value, onClick = { seconds = value },
                                colors = RadioButtonDefaults.colors(selectedColor = palette.accent))
                            Text(label, color = palette.textPrimary)
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                    SettingsField(reason, { reason = it.take(500) }, placeholder = "Reason (optional)", padded = false)
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    dialog = null
                    val chosen = seconds
                    run {
                        ServerAdmin.timeout(server.id, profile.id, chosen, reason.trim().ifBlank { null })
                        timeoutEnds = System.currentTimeMillis() + chosen * 1000L
                    }
                }) { Text("Time out", color = Brand.dnd) }
            },
            dismissButton = { TextButton(onClick = { dialog = null }) { Text("Cancel") } },
        )
        "kick" -> AlertDialog(
            onDismissRequest = { dialog = null },
            title = { Text("Kick ${profile.name}?") },
            text = { Text("They can come back with an invite.") },
            confirmButton = {
                TextButton(onClick = {
                    dialog = null
                    run { ServerAdmin.kick(server.id, profile.id); onBack() }
                }) { Text("Kick", color = Brand.dnd) }
            },
            dismissButton = { TextButton(onClick = { dialog = null }) { Text("Cancel") } },
        )
        "ban" -> AlertDialog(
            onDismissRequest = { dialog = null },
            title = { Text("Ban ${profile.name}?") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("They're removed and can't rejoin until you lift the ban. Only moderators see the reason.")
                    SettingsField(reason, { reason = it.take(500) }, placeholder = "Reason (optional)", padded = false)
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    dialog = null
                    run { ServerAdmin.ban(server.id, profile.id, reason.trim().ifBlank { null }); onBack() }
                }) { Text("Ban", color = Brand.dnd) }
            },
            dismissButton = { TextButton(onClick = { dialog = null }) { Text("Cancel") } },
        )
    }
}

// MARK: - Roles

@Composable
private fun RolesPage(serverId: String, push: (Page) -> Unit, onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    var roles by remember { mutableStateOf<List<ServerAdmin.Role>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    suspend fun load() {
        try {
            roles = ServerAdmin.roles(serverId)
            error = null
        } catch (e: kotlinx.coroutines.CancellationException) { throw e }
        catch (e: Exception) { error = e.message ?: "Couldn't load roles." }
        loading = false
    }
    LaunchedEffect(serverId) { load() }

    val custom = roles.filter { it.isDefault != true }
    val everyone = roles.firstOrNull { it.isDefault == true }

    fun run(work: suspend () -> Unit) {
        busy = true
        scope.launch {
            try { work(); error = null } catch (e: kotlinx.coroutines.CancellationException) { throw e }
            catch (e: Exception) { error = e.message ?: "That didn't work." }
            load()
            busy = false
        }
    }

    Column(Modifier.fillMaxSize()) {
        PageBar("Roles", onBack = onBack) {
            IconButton(enabled = !busy, onClick = {
                run { ServerAdmin.createRole(serverId, "new role", "#99aab5", roles.size) }
            }) {
                Icon(Icons.Filled.Add, contentDescription = "New role", tint = LocalPalette.current.textPrimary)
            }
        }
        LazyColumn(contentPadding = PaddingValues(bottom = 40.dp)) {
            if (loading && roles.isEmpty()) item { LoadingBlock() }
            if (!loading) {
                group("Roles") {
                    if (custom.isEmpty()) {
                        Text("No roles yet. Add one to give people a colour and permissions.",
                            color = LocalPalette.current.textMuted, fontSize = 14.sp, modifier = Modifier.padding(14.dp))
                    }
                    custom.forEachIndexed { index, role ->
                        if (index > 0) SettingsDivider()
                        RoleRow(
                            role = role,
                            // move_role counts up from @everyone (0): the top
                            // of this list is custom.size.
                            onUp = if (index > 0 && !busy) ({ run { ServerAdmin.moveRole(role.id, custom.size - index + 1) } }) else null,
                            onDown = if (index < custom.lastIndex && !busy) ({ run { ServerAdmin.moveRole(role.id, custom.size - index - 1) } }) else null,
                            onClick = { push(Page.RoleEdit(role)) },
                        )
                    }
                }
                item { Footnote("Higher roles outrank lower ones.") }
                everyone?.let { role ->
                    group(null) { RoleRow(role, onUp = null, onDown = null) { push(Page.RoleEdit(role)) } }
                    item { Footnote("Everyone in the space has this role.") }
                }
            }
            error?.let { item { Footnote(it, isError = true) } }
        }
    }
}

@Composable
private fun RoleRow(role: ServerAdmin.Role, onUp: (() -> Unit)?, onDown: (() -> Unit)?, onClick: () -> Unit) {
    val palette = LocalPalette.current
    Row(
        Modifier.fillMaxWidth().clickable(role = Role.Button, onClick = onClick).padding(start = 14.dp, end = 6.dp)
            .heightIn(min = 52.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (role.isDefault == true) {
            Icon(Icons.Filled.Groups, contentDescription = null, tint = palette.textSecondary, modifier = Modifier.size(20.dp))
        } else {
            ColourDot(role.color, size = 14)
        }
        Spacer(Modifier.width(12.dp))
        Text(if (role.isDefault == true) "@everyone" else role.name, color = palette.textPrimary, fontSize = 15.sp,
            maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        if (role.isDefault != true) {
            IconButton(onClick = { onUp?.invoke() }, enabled = onUp != null) {
                Icon(Icons.Filled.KeyboardArrowUp, contentDescription = "Move up",
                    tint = if (onUp != null) palette.textSecondary else palette.textMuted.copy(alpha = 0.3f))
            }
            IconButton(onClick = { onDown?.invoke() }, enabled = onDown != null) {
                Icon(Icons.Filled.KeyboardArrowDown, contentDescription = "Move down",
                    tint = if (onDown != null) palette.textSecondary else palette.textMuted.copy(alpha = 0.3f))
            }
        } else {
            Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = palette.textMuted)
            Spacer(Modifier.width(8.dp))
        }
    }
}

@Composable
private fun RoleEditPage(original: ServerAdmin.Role, onBack: () -> Unit) {
    val palette = LocalPalette.current
    val scope = rememberCoroutineScope()
    var role by remember { mutableStateOf(original) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var confirmDelete by remember { mutableStateOf(false) }
    val isEveryone = role.isDefault == true
    val canSave = role != original && !busy && role.name.isNotBlank()

    Column(Modifier.fillMaxSize()) {
        PageBar(if (isEveryone) "@everyone" else original.name.ifBlank { "Role" }, onBack = onBack) {
            SaveButton(busy = busy, enabled = canSave) {
                busy = true
                scope.launch {
                    try {
                        ServerAdmin.updateRole(role)
                        onBack()
                    } catch (e: Exception) {
                        error = e.message ?: "Couldn't save."
                    } finally {
                        busy = false
                    }
                }
            }
        }
        LazyColumn(contentPadding = PaddingValues(bottom = 40.dp)) {
            if (!isEveryone) {
                item {
                    SectionCaption("Name")
                    SettingsField(role.name, { role = role.copy(name = it.take(100)) }, placeholder = "Role name")
                }
                item {
                    SectionCaption("Colour")
                    Row(
                        Modifier.fillMaxWidth().padding(horizontal = 16.dp)
                            .clip(RoundedCornerShape(16.dp)).background(palette.surface).padding(vertical = 14.dp),
                        horizontalArrangement = Arrangement.SpaceEvenly,
                    ) {
                        RolePermissionCatalogue.colours.forEach { hex ->
                            val selected = role.color.equals(hex, ignoreCase = true)
                            Box(
                                Modifier.size(30.dp).clip(CircleShape)
                                    .border(if (selected) 2.dp else 0.dp, palette.textPrimary, CircleShape)
                                    .padding(4.dp).clip(CircleShape).background(hexColour(hex))
                                    .clickable(onClickLabel = "Colour $hex") { role = role.copy(color = hex) },
                            )
                        }
                    }
                }
            }
            RolePermissionCatalogue.groups.forEach { group ->
                group(group.title) {
                    group.permissions.forEachIndexed { i, permission ->
                        if (i > 0) SettingsDivider()
                        val locked = isEveryone && permission.key !in RolePermissionCatalogue.everyoneAllowed
                        ToggleRow(
                            title = permission.label,
                            subtitle = if (locked) "Not available on @everyone." else permission.hint,
                            checked = role.permissions[permission.key] == true,
                            enabled = !locked,
                        ) { on -> role = role.copy(permissions = role.permissions + (permission.key to on)) }
                    }
                }
            }
            if (!isEveryone) {
                item { Spacer(Modifier.height(18.dp)) }
                item { SettingsGroup { ActionRow("Delete Role", tint = Brand.danger, enabled = !busy) { confirmDelete = true } } }
            }
            error?.let { item { Footnote(it, isError = true) } }
        }
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("Delete ${original.name}?") },
            text = { Text("Everyone who has it loses it.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmDelete = false
                    busy = true
                    scope.launch {
                        try {
                            ServerAdmin.deleteRole(original.id)
                            onBack()
                        } catch (e: Exception) {
                            error = e.message ?: "Couldn't delete the role."
                        } finally {
                            busy = false
                        }
                    }
                }) { Text("Delete", color = Brand.dnd) }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("Cancel") } },
        )
    }
}

// MARK: - Bans

@Composable
private fun BansPage(serverId: String, onBack: () -> Unit) {
    val palette = LocalPalette.current
    val scope = rememberCoroutineScope()
    var bans by remember { mutableStateOf<List<Pair<ServerAdmin.Ban, Profile?>>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var pending by remember { mutableStateOf<Pair<ServerAdmin.Ban, Profile?>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(serverId) {
        try { bans = ServerAdmin.bans(serverId) } catch (e: kotlinx.coroutines.CancellationException) { throw e }
        catch (e: Exception) { error = e.message ?: "Couldn't load bans." }
        loading = false
    }

    Column(Modifier.fillMaxSize()) {
        PageBar("Bans", onBack = onBack)
        LazyColumn(contentPadding = PaddingValues(bottom = 40.dp)) {
            when {
                loading -> item { LoadingBlock() }
                bans.isEmpty() -> item { EmptyBlock("No one is banned") }
                else -> {
                    group(null) {
                        bans.forEachIndexed { i, entry ->
                            val (ban, profile) = entry
                            if (i > 0) SettingsDivider()
                            Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 10.dp),
                                verticalAlignment = Alignment.CenterVertically) {
                                AvatarImage(url = profile?.avatarUrl, name = profile?.name ?: "?", size = 40.dp)
                                Spacer(Modifier.width(12.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(profile?.name ?: "Unknown user", color = palette.textPrimary, fontSize = 15.sp,
                                        fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text(ban.reason?.takeIf { it.isNotBlank() } ?: "No reason given",
                                        color = palette.textMuted, fontSize = 13.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                }
                                TextButton(onClick = { pending = entry }) { Text("Lift", color = palette.accent) }
                            }
                        }
                    }
                    item { Footnote("Banned people can't rejoin until you lift their ban.") }
                }
            }
            error?.let { item { Footnote(it, isError = true) } }
        }
    }

    pending?.let { entry ->
        val (ban, profile) = entry
        AlertDialog(
            onDismissRequest = { pending = null },
            title = { Text("Lift the ban on ${profile?.name ?: "this person"}?") },
            text = { Text("They'll be able to join again with an invite.") },
            confirmButton = {
                TextButton(onClick = {
                    pending = null
                    scope.launch {
                        runCatching { ServerAdmin.unban(serverId, ban.userId) }
                            .onSuccess { bans = bans.filterNot { it.first.userId == ban.userId }; error = null }
                            .onFailure { error = it.message ?: "Couldn't lift the ban." }
                    }
                }) { Text("Lift Ban") }
            },
            dismissButton = { TextButton(onClick = { pending = null }) { Text("Cancel") } },
        )
    }
}

// MARK: - Channels

/** Text channel names take dashes for spaces, as on the web; anything else stays. */
private fun channelSlug(name: String, type: ChannelType): String {
    val trimmed = name.trim()
    val clean = if (type == ChannelType.Text) trimmed.replace(Regex("\\s+"), "-") else trimmed
    return clean.take(100)
}

private fun channelIcon(channel: Channel): ImageVector = when {
    channel.type == ChannelType.Voice -> Icons.AutoMirrored.Filled.VolumeUp
    channel.readOnly == true -> Icons.Filled.Campaign
    else -> Icons.Filled.Tag
}

@Composable
private fun ChannelsPage(server: Server, push: (Page) -> Unit, onChanged: () -> Unit, onBack: () -> Unit) {
    val palette = LocalPalette.current
    val scope = rememberCoroutineScope()
    var channels by remember { mutableStateOf<List<Channel>>(emptyList()) }
    var categories by remember { mutableStateOf<List<ChannelCategory>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var addMenu by remember { mutableStateOf(false) }
    var dialog by remember { mutableStateOf<String?>(null) }
    var text by remember { mutableStateOf("") }
    var newType by remember { mutableStateOf(ChannelType.Text) }
    var newCategory by remember { mutableStateOf<String?>(null) }
    var target by remember { mutableStateOf<ChannelCategory?>(null) }
    var reloads by remember { mutableStateOf(0) }

    LaunchedEffect(server.id, reloads) {
        try {
            channels = Database.channels(server.id)
            categories = runCatching { Database.categories(server.id) }.getOrDefault(categories)
            error = null
        } catch (e: kotlinx.coroutines.CancellationException) { throw e }
        catch (e: Exception) { error = e.message ?: "Couldn't load channels." }
        loading = false
    }

    fun run(work: suspend () -> Unit) {
        scope.launch {
            try { work(); error = null; onChanged() } catch (e: kotlinx.coroutines.CancellationException) { throw e }
            catch (e: Exception) { error = e.message ?: "That didn't work." }
            reloads++
        }
    }

    Column(Modifier.fillMaxSize()) {
        PageBar("Channels", onBack = onBack) {
            Box {
                IconButton(onClick = { addMenu = true }) {
                    Icon(Icons.Filled.Add, contentDescription = "Add", tint = palette.textPrimary)
                }
                DropdownMenu(expanded = addMenu, onDismissRequest = { addMenu = false }) {
                    DropdownMenuItem(text = { Text("New channel") }, onClick = {
                        addMenu = false; text = ""; newType = ChannelType.Text; newCategory = null; dialog = "channel"
                    })
                    DropdownMenuItem(text = { Text("New category") }, onClick = {
                        addMenu = false; text = ""; dialog = "category"
                    })
                }
            }
        }
        LazyColumn(contentPadding = PaddingValues(bottom = 40.dp)) {
            if (loading && channels.isEmpty()) item { LoadingBlock() }
            val loose = channels.filter { it.categoryId == null }.sortedBy { it.position }
            if (loose.isNotEmpty()) {
                group(null) { ChannelRows(loose) { push(Page.ChannelEdit(it)) } }
            }
            categories.sortedBy { it.position }.forEach { category ->
                item(key = "cat:${category.id}") {
                    var menu by remember { mutableStateOf(false) }
                    Row(Modifier.fillMaxWidth().padding(end = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                        SectionCaption(category.name, modifier = Modifier.weight(1f))
                        Box {
                            IconButton(onClick = { menu = true }, modifier = Modifier.size(36.dp)) {
                                Icon(Icons.Filled.MoreHoriz, contentDescription = "${category.name} options", tint = palette.textMuted)
                            }
                            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                                DropdownMenuItem(text = { Text("Rename") }, onClick = {
                                    menu = false; target = category; text = category.name; dialog = "rename-category"
                                })
                                DropdownMenuItem(text = { Text("Delete", color = Brand.dnd) }, onClick = {
                                    menu = false; target = category; dialog = "delete-category"
                                })
                            }
                        }
                    }
                }
                val inside = channels.filter { it.categoryId == category.id }.sortedBy { it.position }
                item(key = "cat-body:${category.id}") {
                    SettingsGroup {
                        if (inside.isEmpty()) {
                            Text("No channels in this category.", color = palette.textMuted, fontSize = 14.sp,
                                modifier = Modifier.padding(14.dp))
                        }
                        ChannelRows(inside) { push(Page.ChannelEdit(it)) }
                    }
                }
            }
            error?.let { item { Footnote(it, isError = true) } }
        }
    }

    when (dialog) {
        "channel" -> AlertDialog(
            onDismissRequest = { dialog = null },
            title = { Text("New channel") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf(ChannelType.Text to "Text", ChannelType.Voice to "Voice").forEach { (type, label) ->
                            val on = newType == type
                            Text(
                                label,
                                color = if (on) Color.White else palette.textSecondary,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.clip(CircleShape)
                                    .background(if (on) palette.accent else palette.elevated)
                                    .clickable { newType = type }
                                    .padding(horizontal = 16.dp, vertical = 8.dp),
                            )
                        }
                    }
                    SettingsField(text, { text = it }, placeholder = if (newType == ChannelType.Voice) "Lounge" else "new-channel",
                        capitalise = newType == ChannelType.Voice, padded = false)
                    val clean = channelSlug(text, newType)
                    if (newType == ChannelType.Text && text.isNotBlank() && clean != text) {
                        Text("It'll be created as #$clean.", color = palette.textMuted, fontSize = 13.sp)
                    }
                    if (categories.isNotEmpty()) {
                        Text("Category", color = palette.textMuted, fontSize = 13.sp)
                        (listOf<ChannelCategory?>(null) + categories.sortedBy { it.position }).forEach { category ->
                            Row(Modifier.fillMaxWidth().clickable { newCategory = category?.id },
                                verticalAlignment = Alignment.CenterVertically) {
                                RadioButton(selected = newCategory == category?.id, onClick = { newCategory = category?.id },
                                    colors = RadioButtonDefaults.colors(selectedColor = palette.accent))
                                Text(category?.name ?: "None", color = palette.textPrimary)
                            }
                        }
                    }
                }
            },
            confirmButton = {
                val clean = channelSlug(text, newType)
                TextButton(enabled = clean.isNotEmpty(), onClick = {
                    dialog = null
                    val type = newType
                    val categoryId = newCategory
                    run { ServerAdmin.createChannel(server.id, clean, type, categoryId) }
                }) { Text("Create") }
            },
            dismissButton = { TextButton(onClick = { dialog = null }) { Text("Cancel") } },
        )
        "category", "rename-category" -> AlertDialog(
            onDismissRequest = { dialog = null },
            title = { Text(if (dialog == "category") "New category" else "Rename category") },
            text = { SettingsField(text, { text = it.take(100) }, placeholder = "Category name", padded = false) },
            confirmButton = {
                TextButton(enabled = text.isNotBlank(), onClick = {
                    val name = text.trim()
                    val renaming = target.takeIf { dialog == "rename-category" }
                    dialog = null
                    run {
                        if (renaming != null) ServerAdmin.renameCategory(renaming.id, name)
                        else ServerAdmin.createCategory(server.id, name)
                    }
                }) { Text(if (dialog == "category") "Create" else "Save") }
            },
            dismissButton = { TextButton(onClick = { dialog = null }) { Text("Cancel") } },
        )
        "delete-category" -> AlertDialog(
            onDismissRequest = { dialog = null },
            title = { Text("Delete ${target?.name ?: "category"}?") },
            text = { Text("Its channels stay, outside any category.") },
            confirmButton = {
                TextButton(onClick = {
                    val category = target
                    dialog = null
                    if (category != null) run { ServerAdmin.deleteCategory(category.id) }
                }) { Text("Delete", color = Brand.dnd) }
            },
            dismissButton = { TextButton(onClick = { dialog = null }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun ChannelRows(channels: List<Channel>, onClick: (Channel) -> Unit) {
    val palette = LocalPalette.current
    channels.forEachIndexed { i, channel ->
        if (i > 0) SettingsDivider()
        Row(
            Modifier.fillMaxWidth().clickable(role = Role.Button) { onClick(channel) }
                .padding(horizontal = 14.dp).heightIn(min = 50.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(channelIcon(channel), contentDescription = null, tint = palette.textSecondary, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(12.dp))
            Text(channel.name, color = palette.textPrimary, fontSize = 15.sp, maxLines = 1,
                overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = palette.textMuted)
        }
    }
}

@Composable
private fun ChannelEditPage(channel: Channel, onChanged: () -> Unit, onBack: () -> Unit) {
    val palette = LocalPalette.current
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf(channel.name) }
    var readOnly by remember { mutableStateOf(channel.readOnly == true) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var confirmDelete by remember { mutableStateOf(false) }
    val clean = channelSlug(name, channel.type)
    val renamed = clean.isNotEmpty() && clean != channel.name

    fun run(close: Boolean, work: suspend () -> Unit) {
        busy = true
        scope.launch {
            try {
                work()
                onChanged()
                if (close) onBack()
            } catch (e: kotlinx.coroutines.CancellationException) { throw e }
            catch (e: Exception) { error = e.message ?: "That didn't work." }
            finally { busy = false }
        }
    }

    Column(Modifier.fillMaxSize()) {
        PageBar(if (channel.type == ChannelType.Voice) channel.name else "#${channel.name}", onBack = onBack) {
            SaveButton(busy = busy, enabled = renamed && !busy) {
                run(close = true) { ServerAdmin.renameChannel(channel.id, clean) }
            }
        }
        LazyColumn(contentPadding = PaddingValues(bottom = 40.dp)) {
            item {
                SectionCaption("Name")
                SettingsField(name, { name = it }, placeholder = "Channel name", capitalise = channel.type == ChannelType.Voice)
                if (channel.type == ChannelType.Text && renamed && clean != name) Footnote("It'll be saved as #$clean.")
            }
            if (channel.type == ChannelType.Text) {
                item {
                    Spacer(Modifier.height(10.dp))
                    SettingsGroup {
                        ToggleRow(title = "Announcement channel", checked = readOnly, enabled = !busy) { on ->
                            val before = readOnly
                            readOnly = on
                            scope.launch {
                                runCatching { ServerAdmin.setReadOnly(channel.id, on) }
                                    .onSuccess { onChanged() }
                                    .onFailure { readOnly = before; error = it.message ?: "Couldn't change that." }
                            }
                        }
                    }
                    Footnote("Only people who can manage channels can post. Everyone else can read and react.")
                }
            }
            item { Spacer(Modifier.height(18.dp)) }
            item { SettingsGroup { ActionRow("Delete Channel", tint = Brand.danger, enabled = !busy) { confirmDelete = true } } }
            error?.let { item { Footnote(it, isError = true) } }
        }
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("Delete ${if (channel.type == ChannelType.Voice) channel.name else "#" + channel.name}?") },
            text = { Text("Every message in it is deleted for everyone. This can't be undone.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmDelete = false
                    run(close = true) { ServerAdmin.deleteChannel(channel.id) }
                }) { Text("Delete", color = Brand.dnd) }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("Cancel") } },
        )
    }
}

// MARK: - Audit log

private val AuditActions = mapOf(
    "member.kick" to "kicked",
    "member.ban" to "banned",
    "member.unban" to "lifted the ban on",
    "member.timeout" to "timed out",
    "member.untimeout" to "removed the timeout on",
    "channel.message.delete" to "deleted a message",
    "dm.message.delete" to "deleted a DM",
    "group.message.delete" to "deleted a group message",
    "webhook.create" to "created",
    "webhook.update" to "updated",
    "webhook.token_reset" to "reset the URL for",
    "webhook.delete" to "deleted",
    "space.partner_set" to "updated the Partner badge on",
    "space.verified_set" to "updated the Verified badge on",
)

@Composable
private fun AuditPage(serverId: String, onBack: () -> Unit) {
    val palette = LocalPalette.current
    var entries by remember { mutableStateOf<List<ServerAdmin.AuditEntry>>(emptyList()) }
    var profiles by remember { mutableStateOf<Map<String, Profile>>(emptyMap()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(serverId) {
        try {
            entries = ServerAdmin.auditLog(serverId)
            val ids = entries.flatMap { listOfNotNull(it.actorId, it.targetId.takeIf { _ -> it.targetType == "user" }) }.distinct()
            if (ids.isNotEmpty()) profiles = runCatching { Database.profiles(ids) }.getOrDefault(emptyMap())
        } catch (e: kotlinx.coroutines.CancellationException) { throw e }
        catch (e: Exception) { error = e.message ?: "Couldn't load the audit log." }
        loading = false
    }

    Column(Modifier.fillMaxSize()) {
        PageBar("Audit Log", onBack = onBack)
        LazyColumn(contentPadding = PaddingValues(bottom = 40.dp)) {
            when {
                loading -> item { LoadingBlock() }
                entries.isEmpty() -> item {
                    EmptyBlock("Nothing logged yet", "Kicks, bans, timeouts and deleted messages will show up here.")
                }
                else -> group(null) {
                    entries.forEachIndexed { i, entry ->
                        if (i > 0) SettingsDivider()
                        val actor = entry.actorId?.let { profiles[it] }
                        val verb = AuditActions[entry.action] ?: entry.action
                        val target = when {
                            entry.targetType == "user" -> " " + (entry.targetId?.let { profiles[it]?.name } ?: "a former member")
                            entry.action.startsWith("webhook.") -> " " + (entry.detail("name") ?: "a webhook")
                            entry.action.startsWith("space.") -> " this space"
                            else -> ""
                        }
                        Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 10.dp)) {
                            AvatarImage(url = actor?.avatarUrl, name = actor?.name ?: "?", size = 36.dp)
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text("${actor?.name ?: "Someone"} $verb$target", color = palette.textSecondary, fontSize = 14.sp)
                                entry.seconds()?.let { s ->
                                    val span = when {
                                        s < 3600 -> "${maxOf(1, s / 60)} min"
                                        s < 86_400 -> "${s / 3600} h"
                                        else -> "${s / 86_400} d"
                                    }
                                    Text("For $span", color = palette.textMuted, fontSize = 12.sp)
                                }
                                entry.detail("reason")?.let {
                                    Text("“$it”", color = palette.textMuted, fontSize = 12.sp, maxLines = 3, overflow = TextOverflow.Ellipsis)
                                }
                                Text(TimeFormat.compact(entry.createdAt), color = palette.textMuted, fontSize = 11.sp)
                            }
                        }
                    }
                }
            }
            error?.let { item { Footnote(it, isError = true) } }
        }
    }
}

// MARK: - Pieces

private fun LazyListScope.group(caption: String?, content: @Composable () -> Unit) {
    item {
        if (caption != null) SectionCaption(caption) else Spacer(Modifier.height(10.dp))
        SettingsGroup { content() }
    }
}

@Composable
private fun PageBar(
    title: String,
    onBack: () -> Unit,
    backIcon: ImageVector = Icons.AutoMirrored.Filled.ArrowBack,
    actions: @Composable RowScope.() -> Unit = {},
) {
    val palette = LocalPalette.current
    Row(
        Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onBack) {
            Icon(backIcon, contentDescription = if (backIcon == Icons.Filled.Close) "Close" else "Back", tint = palette.textPrimary)
        }
        Text(title, color = palette.textPrimary, fontSize = 18.sp, fontWeight = FontWeight.SemiBold,
            maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f).padding(start = 4.dp))
        actions()
    }
}

@Composable
private fun SaveButton(busy: Boolean, enabled: Boolean, onClick: () -> Unit) {
    val palette = LocalPalette.current
    if (busy) {
        CircularProgressIndicator(color = palette.accent, modifier = Modifier.padding(horizontal = 16.dp).size(20.dp))
    } else {
        TextButton(onClick = onClick, enabled = enabled) {
            Text("Save", color = if (enabled) palette.accent else palette.textMuted, fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
private fun NavRow(icon: ImageVector, title: String, onClick: () -> Unit) {
    val palette = LocalPalette.current
    Row(
        Modifier.fillMaxWidth().clickable(role = Role.Button, onClickLabel = title, onClick = onClick)
            .padding(horizontal = 14.dp).heightIn(min = 52.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = palette.textSecondary, modifier = Modifier.size(22.dp))
        Spacer(Modifier.width(14.dp))
        Text(title, color = palette.textPrimary, fontSize = 15.sp, modifier = Modifier.weight(1f))
        Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = palette.textMuted)
    }
}

@Composable
private fun ActionRow(title: String, tint: Color? = null, enabled: Boolean = true, onClick: () -> Unit) {
    val palette = LocalPalette.current
    Box(
        Modifier.fillMaxWidth().clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .padding(horizontal = 14.dp).heightIn(min = 52.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        Text(title, color = (tint ?: palette.textPrimary).copy(alpha = if (enabled) 1f else 0.5f), fontSize = 15.sp,
            fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun ToggleRow(
    title: String,
    checked: Boolean,
    enabled: Boolean = true,
    subtitle: String? = null,
    leading: (@Composable () -> Unit)? = null,
    onChange: (Boolean) -> Unit,
) {
    val palette = LocalPalette.current
    Row(
        Modifier.fillMaxWidth().clickable(enabled = enabled, role = Role.Switch) { onChange(!checked) }
            .padding(horizontal = 14.dp, vertical = 10.dp).heightIn(min = 32.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        leading?.let { it(); Spacer(Modifier.width(12.dp)) }
        Column(Modifier.weight(1f)) {
            Text(title, color = palette.textPrimary.copy(alpha = if (enabled) 1f else 0.6f), fontSize = 15.sp)
            subtitle?.let { Text(it, color = palette.textMuted, fontSize = 13.sp) }
        }
        Spacer(Modifier.width(10.dp))
        Switch(
            checked = checked,
            onCheckedChange = onChange,
            enabled = enabled,
            colors = SwitchDefaults.colors(checkedTrackColor = palette.accent, checkedThumbColor = Color.White),
        )
    }
}

@Composable
private fun ColourDot(hex: String, size: Int = 12) {
    Box(Modifier.size(size.dp).clip(CircleShape).background(hexColour(hex)))
}

private fun hexColour(hex: String): Color = runCatching {
    Color(android.graphics.Color.parseColor(if (hex.startsWith("#")) hex else "#$hex"))
}.getOrDefault(Color(0xFF99AAB5))

@Composable
private fun SettingsField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    enabled: Boolean = true,
    singleLine: Boolean = true,
    capitalise: Boolean = true,
    padded: Boolean = true,
) {
    val palette = LocalPalette.current
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        enabled = enabled,
        singleLine = singleLine,
        minLines = if (singleLine) 1 else 3,
        maxLines = if (singleLine) 1 else 6,
        placeholder = { Text(placeholder, color = palette.textMuted) },
        keyboardOptions = KeyboardOptions(
            capitalization = if (capitalise) KeyboardCapitalization.Sentences else KeyboardCapitalization.None,
            autoCorrectEnabled = capitalise,
        ),
        shape = RoundedCornerShape(14.dp),
        colors = OutlinedTextFieldDefaults.colors(
            focusedContainerColor = palette.surface,
            unfocusedContainerColor = palette.surface,
            disabledContainerColor = palette.surface,
            focusedBorderColor = palette.accent.copy(alpha = 0.5f),
            unfocusedBorderColor = Color.Transparent,
            disabledBorderColor = Color.Transparent,
            focusedTextColor = palette.textPrimary,
            unfocusedTextColor = palette.textPrimary,
            disabledTextColor = palette.textSecondary,
            cursorColor = palette.accent,
        ),
        modifier = Modifier.fillMaxWidth().then(if (padded) Modifier.padding(horizontal = 16.dp) else Modifier),
    )
}

@Composable
private fun Footnote(text: String, isError: Boolean = false) {
    Text(
        text,
        color = if (isError) Brand.dnd else LocalPalette.current.textMuted,
        fontSize = 13.sp,
        modifier = Modifier.padding(horizontal = 24.dp, vertical = 8.dp),
    )
}

@Composable
private fun LoadingBlock() {
    Box(Modifier.fillMaxWidth().padding(top = 48.dp), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = LocalPalette.current.accent, modifier = Modifier.size(26.dp))
    }
}

@Composable
private fun EmptyBlock(title: String, detail: String? = null) {
    val palette = LocalPalette.current
    Column(
        Modifier.fillMaxWidth().padding(top = 48.dp, start = 32.dp, end = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(title, color = palette.textSecondary, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
        detail?.let { Text(it, color = palette.textMuted, fontSize = 14.sp) }
    }
}
