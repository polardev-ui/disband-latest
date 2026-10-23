package com.wsgpolar.disband.ui.main

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.layout
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.wsgpolar.disband.core.AppConfig
import com.wsgpolar.disband.core.Brand
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.core.seeded
import com.wsgpolar.disband.data.Database
import com.wsgpolar.disband.state.AppState
import com.wsgpolar.disband.ui.collectAsStateValue
import com.wsgpolar.disband.ui.components.CapsuleFilterBar
import com.wsgpolar.disband.ui.components.CapsuleSearchField
import com.wsgpolar.disband.ui.components.EmptyState
import com.wsgpolar.disband.ui.components.ErrorState
import kotlinx.coroutines.launch
import java.text.NumberFormat

/** The web's two Discover orders: most members, or most recently created. */
enum class DiscoverSort(val label: String) { Popular("Popular"), New("New") }

/**
 * A space's mark: the Verified seal, or failing that the Partner one, as the
 * web's `serverBadgeFor` picks between them.
 */
@Composable
fun SpaceBadge(verified: Boolean?, partner: Boolean?, size: Dp = 16.dp) {
    when {
        verified == true -> Icon(
            Icons.Filled.Verified,
            contentDescription = "Verified space",
            tint = Brand.verified,
            modifier = Modifier.size(size),
        )
        partner == true -> Box(
            Modifier.size(size).clip(CircleShape).background(PartnerBlurple),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.Filled.Link,
                contentDescription = "Disband Partner",
                tint = Color.White,
                modifier = Modifier.size(size * 0.7f),
            )
        }
    }
}

private val PartnerBlurple = Color(0xFF5865F2)

// MARK: - Add a space

/**
 * Behind the rail's + button: start a space, or join one with an invite. The
 * button used to run an empty lambda, so there was no way to make or join a
 * space on Android at all.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddSpaceSheet(
    app: AppState,
    onDismiss: () -> Unit,
    onOpenSpace: (String) -> Unit,
    onExplore: () -> Unit,
) {
    val palette = LocalPalette.current
    val scope = rememberCoroutineScope()
    var mode by remember { mutableStateOf(AddMode.Create) }
    var name by remember { mutableStateOf("") }
    var invite by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    fun submit() {
        if (busy) return
        val value = if (mode == AddMode.Create) name.trim() else inviteCode(invite)
        if (value.isEmpty()) return
        busy = true
        error = null
        scope.launch {
            try {
                val id = if (mode == AddMode.Create) Database.createServer(value) else Database.joinServer(value)
                app.loadServers()
                onDismiss()
                onOpenSpace(id)
            } catch (e: Exception) {
                error = if (mode == AddMode.Create) {
                    "Couldn't create the space. Try again."
                } else {
                    "Couldn't join. Check the invite and try again."
                }
            } finally {
                busy = false
            }
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = palette.surface,
    ) {
        Column(Modifier.padding(bottom = 24.dp).navigationBarsPadding()) {
            Text(
                "Add a space",
                color = palette.textPrimary,
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(horizontal = 20.dp),
            )
            Spacer(Modifier.height(14.dp))
            CapsuleFilterBar(
                options = AddMode.entries,
                selected = mode,
                onSelect = { mode = it; error = null },
                title = { it.label },
            )
            Spacer(Modifier.height(16.dp))

            if (mode == AddMode.Create) {
                SheetField(
                    value = name,
                    onValueChange = { name = it.take(100) },
                    placeholder = "Space name",
                    capitalise = true,
                    onDone = ::submit,
                )
                Hint("You can change the name, icon and banner later.")
            } else {
                SheetField(
                    value = invite,
                    onValueChange = { invite = it },
                    placeholder = "Invite link or code",
                    capitalise = false,
                    onDone = ::submit,
                )
                Hint("Paste a link like disband.dev/server/aB3xY9k, or just the code.")
            }

            error?.let {
                Text(
                    it,
                    color = Brand.dnd,
                    fontSize = 13.sp,
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 6.dp),
                )
            }

            Spacer(Modifier.height(10.dp))
            val ready = if (mode == AddMode.Create) name.isNotBlank() else inviteCode(invite).isNotEmpty()
            PrimaryButton(
                label = when {
                    busy && mode == AddMode.Create -> "Creating…"
                    busy -> "Joining…"
                    mode == AddMode.Create -> "Create space"
                    else -> "Join space"
                },
                enabled = ready && !busy,
                onClick = ::submit,
            )

            Spacer(Modifier.height(18.dp))
            Row(
                Modifier
                    .fillMaxWidth()
                    .clickable(role = Role.Button, onClickLabel = "Explore public spaces") {
                        onDismiss()
                        onExplore()
                    }
                    .padding(horizontal = 20.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.Explore, contentDescription = null, tint = palette.accent, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text("Explore public spaces", color = palette.textPrimary, fontSize = 15.sp, fontWeight = FontWeight.Medium)
                    Text("Find one to join in Discover.", color = palette.textMuted, fontSize = 13.sp)
                }
                Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = palette.textMuted)
            }
        }
    }
}

private enum class AddMode(val label: String) { Create("Create"), Join("Join") }

/** The code from a pasted link, or the text itself when it's already a code. */
private fun inviteCode(raw: String): String {
    val trimmed = raw.trim()
    return AppConfig.INVITE_LINK_REGEX.find(trimmed)?.groupValues?.getOrNull(1) ?: trimmed.trimEnd('/')
}

// MARK: - Discover

/**
 * Public spaces, Popular (most members) first and New (most recently
 * created) a tap away, matching the web's two Discover tabs. Spaces you're in
 * say Open; the rest join in one tap.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DiscoverSheet(
    app: AppState,
    onDismiss: () -> Unit,
    onOpenSpace: (String) -> Unit,
) {
    val palette = LocalPalette.current
    val scope = rememberCoroutineScope()
    val servers by app.servers.collectAsStateValue()
    val joined = remember(servers) { servers.map { it.id }.toSet() }

    var items by remember { mutableStateOf<List<Database.DiscoverableServer>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var query by remember { mutableStateOf("") }
    var sort by remember { mutableStateOf(DiscoverSort.Popular) }
    var joiningId by remember { mutableStateOf<String?>(null) }
    var joinError by remember { mutableStateOf<String?>(null) }
    var reloads by remember { mutableStateOf(0) }

    LaunchedEffect(reloads) {
        loading = items.isEmpty()
        try {
            items = Database.discoverableServers()
            error = null
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (_: Exception) {
            error = "Couldn't load spaces. Check your connection."
        } finally {
            loading = false
        }
    }

    val visible = remember(items, query, sort) {
        val needle = query.trim().lowercase()
        val matches = if (needle.isEmpty()) items else items.filter {
            it.name.lowercase().contains(needle) ||
                (it.description ?: "").lowercase().contains(needle) ||
                (it.ownerName ?: "").lowercase().contains(needle)
        }
        when (sort) {
            DiscoverSort.Popular -> matches.sortedWith(
                compareByDescending<Database.DiscoverableServer> { it.memberCount }.thenBy { it.name.lowercase() },
            )
            // ISO timestamps from Postgres sort correctly as strings.
            DiscoverSort.New -> matches.sortedByDescending { it.createdAt ?: "" }
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = palette.background,
    ) {
        Column(Modifier.fillMaxHeight(0.94f)) {
            Column(Modifier.padding(horizontal = 20.dp)) {
                Text("Discover", color = palette.textPrimary, fontSize = 28.sp, fontWeight = FontWeight.Bold)
                Text("Find a space for your people.", color = palette.textMuted, fontSize = 14.sp)
            }
            Spacer(Modifier.height(14.dp))
            CapsuleSearchField(text = query, onValueChange = { query = it }, prompt = "Search spaces")
            Spacer(Modifier.height(10.dp))
            CapsuleFilterBar(
                options = DiscoverSort.entries,
                selected = sort,
                onSelect = { sort = it },
                title = { it.label },
            )
            Spacer(Modifier.height(8.dp))

            when {
                loading -> Box(Modifier.fillMaxWidth().padding(top = 60.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = palette.accent, modifier = Modifier.size(28.dp))
                }
                error != null -> ErrorState(message = error!!, onRetry = { reloads++ })
                visible.isEmpty() -> EmptyState(
                    title = if (items.isEmpty()) "No public spaces yet" else "No spaces match “${query.trim()}”",
                )
                else -> LazyColumn(
                    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 6.dp, bottom = 32.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    item(key = "heading") {
                        val q = query.trim()
                        Text(
                            when {
                                q.isNotEmpty() -> "${visible.size} ${if (visible.size == 1) "result" else "results"} for “$q”"
                                sort == DiscoverSort.Popular -> "Popular spaces"
                                else -> "New spaces"
                            },
                            color = palette.textMuted,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(horizontal = 4.dp),
                        )
                        joinError?.let {
                            Text(it, color = Brand.dnd, fontSize = 13.sp, modifier = Modifier.padding(4.dp))
                        }
                    }
                    items(visible, key = { it.id }) { server ->
                        DiscoverCard(
                            server = server,
                            member = server.id in joined,
                            joining = joiningId == server.id,
                            showCreated = sort == DiscoverSort.New,
                            onOpen = {
                                onDismiss()
                                onOpenSpace(server.id)
                            },
                            onJoin = {
                                if (joiningId != null) return@DiscoverCard
                                joiningId = server.id
                                joinError = null
                                scope.launch {
                                    try {
                                        Database.joinServerById(server.id)
                                        app.loadServers()
                                    } catch (e: kotlinx.coroutines.CancellationException) {
                                        throw e
                                    } catch (_: Exception) {
                                        joinError = "Couldn't join ${server.name}."
                                    } finally {
                                        joiningId = null
                                    }
                                }
                            },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun DiscoverCard(
    server: Database.DiscoverableServer,
    member: Boolean,
    joining: Boolean,
    showCreated: Boolean,
    onOpen: () -> Unit,
    onJoin: () -> Unit,
) {
    val palette = LocalPalette.current
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(24.dp))
            .background(palette.surface),
    ) {
        SpaceBanner(url = server.bannerUrl, seed = server.id, height = 96.dp)
        Column(Modifier.pullUp(30.dp).padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.Bottom) {
                SpaceIcon(url = server.iconUrl, name = server.name, id = server.id)
                Spacer(Modifier.weight(1f))
                if (member) {
                    CardButton("Open", background = palette.elevated, foreground = palette.textPrimary, onClick = onOpen)
                } else {
                    CardButton(
                        if (joining) "Joining…" else "Join",
                        background = Brand.online,
                        foreground = Color.White,
                        enabled = !joining,
                        onClick = onJoin,
                    )
                }
            }
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text(
                    server.name,
                    color = palette.textPrimary,
                    fontSize = 17.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                SpaceBadge(verified = server.verified, partner = server.partner)
            }
            server.description?.takeIf { it.isNotBlank() }?.let {
                Text(it, color = palette.textSecondary, fontSize = 14.sp, maxLines = 3, overflow = TextOverflow.Ellipsis)
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(7.dp).clip(CircleShape).background(Brand.online))
                Spacer(Modifier.width(6.dp))
                val count = NumberFormat.getIntegerInstance().format(server.memberCount)
                val created = if (showCreated) createdLabel(server.createdAt) else null
                Text(
                    "$count member${if (server.memberCount == 1) "" else "s"}" + (created?.let { " · $it" } ?: ""),
                    color = palette.textMuted,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                )
            }
        }
    }
}

/**
 * Draws the content [amount] higher and reports it that much shorter, so an
 * icon can overlap the banner above it without leaving a gap underneath —
 * `offset` moves the drawing but keeps the original space.
 */
private fun Modifier.pullUp(amount: Dp): Modifier = layout { measurable, constraints ->
    val placeable = measurable.measure(constraints)
    val shift = amount.roundToPx()
    layout(placeable.width, (placeable.height - shift).coerceAtLeast(0)) {
        placeable.place(0, -shift)
    }
}

/** "Created 3 days ago", from an ISO timestamp. */
private fun createdLabel(iso: String?): String? {
    val instant = iso?.let { runCatching { java.time.OffsetDateTime.parse(it).toInstant() }.getOrNull() } ?: return null
    val days = java.time.Duration.between(instant, java.time.Instant.now()).toDays()
    return when {
        days < 1 -> "Created today"
        days == 1L -> "Created yesterday"
        days < 30 -> "Created $days days ago"
        days < 365 -> "Created ${days / 30} month${if (days / 30 == 1L) "" else "s"} ago"
        else -> "Created ${days / 365} year${if (days / 365 == 1L) "" else "s"} ago"
    }
}

// MARK: - Invite link

/**
 * The join card for an invite link that opened the app: what the space is,
 * how many are in it, and Join (or Open, when you're already a member).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InviteJoinSheet(
    app: AppState,
    code: String,
    onDismiss: () -> Unit,
    onOpenSpace: (String) -> Unit,
) {
    val palette = LocalPalette.current
    val scope = rememberCoroutineScope()
    val servers by app.servers.collectAsStateValue()
    var preview by remember { mutableStateOf<Database.InvitePreview?>(null) }
    var loading by remember { mutableStateOf(true) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(code) {
        loading = true
        preview = runCatching { Database.serverByInvite(code) }.getOrNull()
        if (preview == null) error = "This invite is invalid or has expired."
        loading = false
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = palette.surface,
    ) {
        Column(Modifier.padding(bottom = 24.dp).navigationBarsPadding()) {
            val space = preview
            when {
                loading -> Box(Modifier.fillMaxWidth().height(200.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = palette.accent, modifier = Modifier.size(28.dp))
                }
                space == null -> Column(Modifier.padding(horizontal = 20.dp, vertical = 12.dp)) {
                    Text("Invite unavailable", color = palette.textPrimary, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(6.dp))
                    Text(error ?: "", color = palette.textMuted, fontSize = 14.sp)
                }
                else -> {
                    val member = servers.any { it.id == space.id }
                    Column(Modifier.padding(horizontal = 16.dp).clip(RoundedCornerShape(20.dp)).background(palette.background)) {
                        SpaceBanner(url = space.bannerUrl, seed = space.id, height = 104.dp)
                        Column(Modifier.pullUp(30.dp).padding(start = 14.dp, end = 14.dp, top = 14.dp, bottom = 16.dp)) {
                            SpaceIcon(url = space.iconUrl, name = space.name, id = space.id)
                            Spacer(Modifier.height(10.dp))
                            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text("You've been invited to join", color = palette.textMuted, fontSize = 13.sp)
                                Text(space.name, color = palette.textPrimary, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                                space.description?.takeIf { it.isNotBlank() }?.let {
                                    Text(it, color = palette.textSecondary, fontSize = 14.sp, maxLines = 4, overflow = TextOverflow.Ellipsis)
                                }
                                val count = NumberFormat.getIntegerInstance().format(space.memberCount)
                                Text("$count member${if (space.memberCount == 1) "" else "s"}", color = palette.textMuted, fontSize = 12.sp)
                            }
                        }
                    }
                    error?.takeIf { preview != null }?.let {
                        Text(it, color = Brand.dnd, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp))
                    }
                    Spacer(Modifier.height(14.dp))
                    PrimaryButton(
                        label = when {
                            member -> "Open space"
                            busy -> "Joining…"
                            else -> "Join space"
                        },
                        enabled = !busy,
                        onClick = {
                            if (member) {
                                onDismiss()
                                onOpenSpace(space.id)
                                return@PrimaryButton
                            }
                            busy = true
                            error = null
                            scope.launch {
                                try {
                                    val id = Database.joinServer(code)
                                    app.loadServers()
                                    onDismiss()
                                    onOpenSpace(id)
                                } catch (e: kotlinx.coroutines.CancellationException) {
                                    throw e
                                } catch (_: Exception) {
                                    error = "Couldn't join. You may be banned, or the invite has expired."
                                } finally {
                                    busy = false
                                }
                            }
                        },
                    )
                }
            }
        }
    }
}

// MARK: - Pieces

@Composable
private fun SpaceBanner(url: String?, seed: String, height: Dp) {
    Box(Modifier.fillMaxWidth().height(height)) {
        if (!url.isNullOrBlank()) {
            AsyncImage(
                model = url,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        } else {
            Box(
                Modifier.fillMaxSize().background(
                    Brush.linearGradient(listOf(Color.seeded(seed), Color.seeded(seed + "·").copy(alpha = 0.6f))),
                ),
            )
        }
    }
}

@Composable
private fun SpaceIcon(url: String?, name: String, id: String, modifier: Modifier = Modifier) {
    val palette = LocalPalette.current
    val shape = RoundedCornerShape(18.dp)
    Box(
        modifier
            .size(62.dp)
            .clip(shape)
            .background(palette.surface)
            .padding(4.dp)
            .clip(RoundedCornerShape(15.dp))
            .background(Color.seeded(id)),
        contentAlignment = Alignment.Center,
    ) {
        if (!url.isNullOrBlank()) {
            AsyncImage(model = url, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        } else {
            Text(
                name.split(" ").filter { it.isNotBlank() }.take(2).joinToString("") { it.take(1).uppercase() }.ifEmpty { "?" },
                color = Color.White,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}

@Composable
private fun CardButton(
    label: String,
    background: Color,
    foreground: Color,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    Row(
        Modifier
            .heightIn(min = 36.dp)
            .clip(CircleShape)
            .background(background.copy(alpha = if (enabled) 1f else 0.6f))
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .padding(horizontal = 18.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, color = foreground, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
        if (label == "Open") {
            Spacer(Modifier.width(6.dp))
            Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = null, tint = foreground, modifier = Modifier.size(16.dp))
        }
    }
}

@Composable
private fun PrimaryButton(label: String, enabled: Boolean, onClick: () -> Unit) {
    val palette = LocalPalette.current
    Box(
        Modifier
            .padding(horizontal = 20.dp)
            .fillMaxWidth()
            .heightIn(min = 50.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(if (enabled) palette.accent else palette.accent.copy(alpha = 0.45f))
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun SheetField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    capitalise: Boolean,
    onDone: () -> Unit,
) {
    val palette = LocalPalette.current
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp),
        placeholder = { Text(placeholder, color = palette.textMuted) },
        singleLine = true,
        keyboardOptions = KeyboardOptions(
            capitalization = if (capitalise) KeyboardCapitalization.Sentences else KeyboardCapitalization.None,
            autoCorrectEnabled = capitalise,
            imeAction = ImeAction.Done,
        ),
        keyboardActions = KeyboardActions(onDone = { onDone() }),
        shape = RoundedCornerShape(14.dp),
        colors = OutlinedTextFieldDefaults.colors(
            focusedContainerColor = palette.elevated,
            unfocusedContainerColor = palette.elevated,
            focusedBorderColor = palette.accent.copy(alpha = 0.5f),
            unfocusedBorderColor = Color.Transparent,
            focusedTextColor = palette.textPrimary,
            unfocusedTextColor = palette.textPrimary,
            cursorColor = palette.accent,
        ),
    )
}

@Composable
private fun Hint(text: String) {
    Text(
        text,
        color = LocalPalette.current.textMuted,
        fontSize = 13.sp,
        modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
    )
}
