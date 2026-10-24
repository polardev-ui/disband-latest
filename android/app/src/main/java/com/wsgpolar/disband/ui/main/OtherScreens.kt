package com.wsgpolar.disband.ui.main

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.Brush
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.CardGiftcard
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.Mood
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import coil.compose.AsyncImage
import com.wsgpolar.disband.BuildConfig
import com.wsgpolar.disband.core.Brand
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.core.Palette
import com.wsgpolar.disband.core.Radii
import com.wsgpolar.disband.core.Themes
import com.wsgpolar.disband.core.TimeFormat
import com.wsgpolar.disband.core.color
import com.wsgpolar.disband.data.BadgeDef
import com.wsgpolar.disband.data.AwardedBadge
import com.wsgpolar.disband.data.BadgeService
import com.wsgpolar.disband.data.Database
import com.wsgpolar.disband.data.MediaService
import com.wsgpolar.disband.data.Note
import com.wsgpolar.disband.data.Profile
import com.wsgpolar.disband.data.UserStatus
import com.wsgpolar.disband.state.AppState
import com.wsgpolar.disband.ui.AvatarImage
import com.wsgpolar.disband.ui.collectAsStateValue
import com.wsgpolar.disband.ui.components.EmptyState
import com.wsgpolar.disband.ui.components.ErrorState
import com.wsgpolar.disband.ui.components.ScreenHeader
import com.wsgpolar.disband.ui.components.SectionCaption
import kotlinx.coroutines.launch

@Composable
fun YouScreen(app: AppState, onOpenNotification: (String) -> Unit = {}) {
    val palette = LocalPalette.current
    val profile by app.profile.collectAsStateValue()
    val profileError by app.profileError.collectAsStateValue()
    val presence by app.presence.statuses.collectAsStateValue()
    val ownStatus = profile?.let { presence[it.id] ?: it.status }
    val themeId by app.themeManager.themeId.collectAsStateValue()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var notifGranted by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        )
    }
    val requestNotifs = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted -> notifGranted = granted }

    var showAccount by remember { mutableStateOf(false) }
    var showStatus by remember { mutableStateOf(false) }
    var showReferrals by remember { mutableStateOf(false) }
    var showAppearance by remember { mutableStateOf(false) }
    var showNotificationInbox by remember { mutableStateOf(false) }
    var showNotificationSettings by remember { mutableStateOf(false) }
    var confirmSignOut by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxSize().background(palette.background)) {
        ScreenHeader(
            title = "You",
            actions = {
                IconButton(
                    onClick = { showNotificationInbox = true },
                    modifier = Modifier.size(48.dp),
                ) {
                    Icon(
                        Icons.Filled.Notifications,
                        contentDescription = "Notifications",
                        tint = palette.textPrimary,
                        modifier = Modifier.size(20.dp),
                    )
                }
                IconButton(
                    onClick = { showAccount = true },
                    modifier = Modifier.size(48.dp),
                ) {
                    Icon(
                        Icons.Filled.Edit,
                        contentDescription = "Edit profile",
                        tint = palette.textPrimary,
                        modifier = Modifier.size(20.dp),
                    )
                }
            },
        )
        HorizontalDivider(color = palette.divider)
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(start = 16.dp, end = 16.dp, top = 0.dp, bottom = 132.dp),
        ) {

            Spacer(Modifier.height(16.dp))

            if (profile == null) {
                Box(
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(Radii.card))
                        .background(palette.surface)
                        .padding(16.dp),
                ) {
                    Column {
                        Text(
                            "Couldn't load your profile", color = palette.textPrimary,
                            fontSize = 16.sp, fontWeight = FontWeight.SemiBold
                        )
                        profileError?.let {
                            Spacer(Modifier.height(6.dp))
                            Text(it, color = palette.textMuted, fontSize = 13.sp)
                        }
                        Spacer(Modifier.height(10.dp))
                        OutlinedButton(onClick = { scope.launch { app.loadProfile() } }) {
                            Text("Retry", color = palette.textPrimary)
                        }
                    }
                }
                Spacer(Modifier.height(12.dp))
            }

            profile?.let { p ->
                ProfileHeroCard(
                    profile = p,
                    app = app,
                    onEditAvatar = { showAccount = true },
                    onEditBanner = { showAccount = true },
                    onStatusTap = { showStatus = true },
                )
                Spacer(Modifier.height(12.dp))
                PlanCard(app, palette)
                Spacer(Modifier.height(12.dp))
            }

            // Account group — mirrors iOS: Edit profile / Status / Referrals.
            SectionCaption("Account", modifier = Modifier.padding(start = 8.dp))
            SettingsGroupCard(
                rows = listOf(
                    SettingsRow(
                        Icons.Filled.AccountCircle, "Edit profile",
                        detail = profile?.pronouns,
                        tint = palette.accent, palette = palette,
                    ) { showAccount = true },
                    SettingsRow(
                        Icons.Filled.Mood, "Status",
                        detail = profile?.activeStatusNote ?: ownStatus?.label,
                        tint = Color(0xFFFAA61A), palette = palette,
                    ) { showStatus = true },
                    SettingsRow(
                        Icons.Filled.CardGiftcard, "Referrals",
                        detail = "Win $100",
                        tint = Color(0xFF1ABC9C), palette = palette,
                    ) { showReferrals = true },
                ),
                palette = palette,
            )
            Spacer(Modifier.height(12.dp))

            // App group — Appearance / Notifications & chat.
            SectionCaption("App", modifier = Modifier.padding(start = 8.dp))
            SettingsGroupCard(
                rows = listOf(
                    SettingsRow(
                        Icons.Filled.Brush, "Appearance",
                        detail = Themes.definition(themeId).label,
                        tint = Color(0xFF9B59B6), palette = palette,
                    ) { showAppearance = true },
                    SettingsRow(
                        Icons.Filled.Notifications, "Notifications & chat",
                        tint = Color(0xFFF0B232), palette = palette,
                        trailing = if (!notifGranted) "Enable" else null,
                    ) {
                        if (!notifGranted) {
                            requestNotifs.launch(Manifest.permission.POST_NOTIFICATIONS)
                        }
                        showNotificationSettings = true
                    },
                ),
                palette = palette,
            )
            Spacer(Modifier.height(12.dp))

            // About group.
            SectionCaption("About", modifier = Modifier.padding(start = 8.dp))
            SettingsGroupCard(
                rows = listOf(
                    SettingsRow(
                        Icons.Filled.Info, "Version",
                        tint = Color(0xFF4E5058), palette = palette,
                        trailing = "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})",
                    ),
                    SettingsRow(Icons.Filled.Language, "disband.dev", tint = Color(0xFF1ABC9C), palette = palette) {
                        context.startActivity(
                            android.content.Intent(
                                android.content.Intent.ACTION_VIEW,
                                android.net.Uri.parse("https://www.disband.dev"),
                            )
                        )
                    },
                    SettingsRow(Icons.Filled.Star, "Rate Disband", tint = Color(0xFFF0B232), palette = palette) {
                        val market = android.content.Intent(
                            android.content.Intent.ACTION_VIEW,
                            android.net.Uri.parse("market://details?id=${context.packageName}"),
                        )
                        runCatching { context.startActivity(market) }.onFailure {
                            context.startActivity(
                                android.content.Intent(
                                    android.content.Intent.ACTION_VIEW,
                                    android.net.Uri.parse("https://play.google.com/store/apps/details?id=${context.packageName}"),
                                )
                            )
                        }
                    },
                ),
                palette = palette,
            )
            Spacer(Modifier.height(12.dp))

            // Sign out — destructive, with confirm.
            SettingsGroupCard(
                rows = listOf(
                    SettingsRow(Icons.Filled.Logout, "Sign out", tint = Brand.dnd, palette = palette, textColor = Brand.dnd) {
                        confirmSignOut = true
                    },
                ),
                palette = palette,
            )
            Spacer(Modifier.height(16.dp))
        }
    }

    if (showAccount) AccountSheet(app) { showAccount = false }
    if (showStatus) StatusSheet(app) { showStatus = false }
    if (showReferrals) ReferralsSheet(app) { showReferrals = false }
    if (showAppearance) AppearanceSheet(app) { showAppearance = false }
    if (showNotificationInbox) {
        NotificationInboxSheet(
            app = app,
            onOpenSource = onOpenNotification,
            onDismiss = { showNotificationInbox = false },
        )
    }
    if (showNotificationSettings) {
        NotificationsSheet(app) { showNotificationSettings = false }
    }
    if (confirmSignOut) {
        AlertDialog(
            onDismissRequest = { confirmSignOut = false },
            title = { Text("Sign out?") },
            text = { Text("You'll need to sign back in to keep chatting.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmSignOut = false
                    scope.launch { app.signOut() }
                }) { Text("Sign out", color = Brand.dnd) }
            },
            dismissButton = {
                TextButton(onClick = { confirmSignOut = false }) { Text("Cancel") }
            },
        )
    }
}

/** Hero card mirroring iOS ProfileTab: banner, avatar, name, badges, status, bio. */
@Composable
private fun ProfileHeroCard(
    profile: Profile,
    app: AppState,
    onEditAvatar: () -> Unit,
    onEditBanner: () -> Unit,
    onStatusTap: () -> Unit,
) {
    val palette = LocalPalette.current
    val badgeService = remember { BadgeService() }
    var badges by remember(profile.id) { mutableStateOf<List<AwardedBadge>>(emptyList()) }
    LaunchedEffect(profile.id) {
        badges = runCatching { badgeService.badgesFor(profile.id) }.getOrDefault(emptyList())
    }

    Box(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(Radii.hero))
            .background(palette.surface)
            .border(1.dp, palette.divider.copy(alpha = 0.5f), RoundedCornerShape(Radii.hero)),
    ) {
        Column {
            // Banner — 124dp like iOS, tap to change.
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(124.dp)
                    .clickable(role = Role.Button, onClickLabel = "Change banner", onClick = onEditBanner),
            ) {
                if (!profile.bannerUrl.isNullOrBlank()) {
                    AsyncImage(
                        model = profile.bannerUrl,
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize(),
                    )
                } else {
                    Box(
                        Modifier.fillMaxSize().background(
                            Brush.horizontalGradient(listOf(palette.accent, palette.accentSoft)),
                        ),
                    )
                }
                Box(
                    Modifier.fillMaxSize().background(
                        Brush.verticalGradient(
                            listOf(Color.Transparent, palette.surface.copy(alpha = 0.6f)),
                        ),
                    ),
                )
            }
            Column(Modifier.padding(horizontal = 16.dp).padding(bottom = 16.dp)) {
                // Avatar overlapping the banner by -46dp, accent ring + camera pip.
                Box(Modifier.offset(y = (-46).dp)) {
                    Box(
                        Modifier
                            .size(88.dp)
                            .clip(CircleShape)
                            .border(3.dp, palette.accent, CircleShape)
                            .background(palette.surface)
                            .clickable(role = Role.Button, onClickLabel = "Change avatar", onClick = onEditAvatar),
                        contentAlignment = Alignment.Center,
                    ) {
                        AvatarImage(url = profile.avatarUrl, name = profile.name, size = 82.dp)
                    }
                    Box(
                        Modifier
                            .align(Alignment.BottomEnd)
                            .offset(x = 2.dp, y = 2.dp)
                            .size(28.dp)
                            .clip(CircleShape)
                            .background(palette.accent)
                            .border(2.dp, palette.surface, CircleShape)
                            .clickable(role = Role.Button, onClickLabel = "Change avatar", onClick = onEditAvatar),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            Icons.Filled.CameraAlt,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(14.dp),
                        )
                    }
                }
                Text(
                    profile.name,
                    color = palette.textPrimary,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.offset(y = (-28).dp),
                )
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.offset(y = (-24).dp),
                ) {
                    Text("@${profile.handle}", color = palette.textMuted, fontSize = 13.sp)
                    profile.pronouns?.takeIf { it.isNotBlank() }?.let {
                        Text(" · $it", color = palette.textMuted, fontSize = 13.sp)
                    }
                }
                // Badges: the web's own emblems (see BadgeIcon), catalogue
                // first, the legacy profile flags as a fallback.
                val legacyBadges = buildList {
                    if (profile.showOwnerBadge == true) add(BadgeDef(key = "owner", name = "Disband Owner"))
                    if (profile.showStaffBadge == true) add(BadgeDef(key = "staff", name = "Disband Staff"))
                    if (profile.showOgBadge == true) add(BadgeDef(key = "og", name = "OG"))
                    if (profile.showBountyBadge == true) add(BadgeDef(key = "bounty", name = "Bug Bounty Hunter"))
                }
                val shownBadges = if (badges.isNotEmpty()) badges.map { it.def } else legacyBadges
                var showBadgeList by remember { mutableStateOf(false) }
                if (shownBadges.isNotEmpty()) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.offset(y = (-16).dp).padding(top = 8.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .background(palette.elevated)
                            .clickable(role = Role.Button, onClickLabel = "Show badges") { showBadgeList = true }
                            .padding(horizontal = 8.dp, vertical = 6.dp),
                    ) {
                        shownBadges.forEach { def -> com.wsgpolar.disband.ui.components.BadgeIcon(def.key, 22.dp, def.name) }
                    }
                }
                if (showBadgeList) {
                    androidx.compose.material3.AlertDialog(
                        onDismissRequest = { showBadgeList = false },
                        confirmButton = { androidx.compose.material3.TextButton(onClick = { showBadgeList = false }) { Text("Done") } },
                        title = { Text("Badges") },
                        text = {
                            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                shownBadges.forEach { def ->
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        com.wsgpolar.disband.ui.components.BadgeIcon(def.key, 28.dp)
                                        Spacer(Modifier.width(12.dp))
                                        Column {
                                            Text(def.name, color = palette.textPrimary, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                                            if (def.description.isNotBlank()) Text(def.description, color = palette.textMuted, fontSize = 13.sp)
                                        }
                                    }
                                }
                            }
                        },
                    )
                }
                // Status bubble — capsule with presence dot + note, tap to edit.
                val statusNote = profile.activeStatusNote
                val presence by app.presence.statuses.collectAsStateValue()
                val selfStatus = presence[profile.id] ?: profile.status
                Box(
                    Modifier
                        .offset(y = if (shownBadges.isNotEmpty()) (-8).dp else (-16).dp)
                        .padding(top = 8.dp)
                        .clip(CircleShape)
                        .background(palette.elevated)
                        .clickable(role = Role.Button, onClickLabel = "Set status", onClick = onStatusTap)
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            Modifier.size(10.dp).clip(CircleShape)
                                .background(selfStatus.color(palette)),
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            statusNote ?: selfStatus.label,
                            color = if (statusNote != null) palette.textPrimary else palette.textMuted,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Medium,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f, fill = false),
                        )
                        Spacer(Modifier.width(4.dp))
                        Icon(
                            Icons.Filled.ChevronRight,
                            contentDescription = null,
                            tint = palette.textMuted,
                            modifier = Modifier.size(14.dp),
                        )
                    }
                }
                profile.bio?.takeIf { it.isNotBlank() }?.let { bio ->
                    Spacer(Modifier.height(10.dp))
                    Text(bio, color = palette.textSecondary, fontSize = 14.sp)
                }
            }
        }
    }
}

/**
 * Which plan this account is on.
 *
 * Android showed nothing at all, so someone paying for Aero had no sign of it
 * on their phone and quietly got the free limits. The card states the plan and
 * — for a subscriber — where the next payment is going, which differs by who
 * is billing: an App Store subscription can only be managed on the device that
 * bought it, and offering a web link for one is a dead end.
 */
@Composable
private fun PlanCard(app: AppState, palette: Palette) {
    val subs = app.subscriptions
    val plan = subs.plan
    val row = subs.subscription

    val detail = when {
        row == null -> "Active"
        row.status == "past_due" && row.isApple ->
            "Payment issue — update your Apple Account payment method"
        row.status == "past_due" -> "Payment issue — update your card on the web"
        row.currentPeriodEnd != null -> "Active · renews ${TimeFormat.compact(row.currentPeriodEnd)}"
        else -> "Active"
    }

    if (plan.isPaid) {
        Row(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(Radii.hero))
                .background(
                    Brush.horizontalGradient(listOf(Color(0xFF4A3B0A), palette.surface)),
                )
                .border(1.dp, Brand.gold.copy(alpha = 0.45f), RoundedCornerShape(Radii.hero))
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier
                    .size(46.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(Brand.gold),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.AutoAwesome, contentDescription = null, tint = Color.Black)
            }
            Spacer(Modifier.width(14.dp))
            Column {
                Text("Disband Aero", color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                Text(detail, color = Color.White.copy(alpha = 0.75f), fontSize = 13.sp)
            }
        }
    } else {
        Column(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(Radii.hero))
                .background(palette.surface)
                .border(1.dp, palette.divider.copy(alpha = 0.5f), RoundedCornerShape(Radii.hero))
                .padding(16.dp),
        ) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text("Disband Free", color = palette.textPrimary, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.weight(1f))
                Text(
                    "AERO",
                    color = Brand.gold,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier
                        .clip(RoundedCornerShape(50))
                        .background(Brand.gold.copy(alpha = 0.2f))
                        .padding(horizontal = 8.dp, vertical = 3.dp),
                )
            }
            Spacer(Modifier.height(8.dp))
            Text(
                "Aero adds 500 MB uploads, 1440p video, animated avatars and banners, " +
                    "4 Catalysts a month, and every theme.",
                color = palette.textSecondary,
                fontSize = 14.sp,
            )
            Spacer(Modifier.height(6.dp))
            // A plain statement, not a link. Play's billing rules are the
            // mirror of Apple's: pointing an in-app user at an outside
            // checkout for a digital subscription is what gets an app pulled.
            Text("Available on disband.dev", color = palette.textMuted, fontSize = 12.sp)
        }
    }
}

private data class SettingsRow(
    val icon: ImageVector,
    val label: String,
    val tint: Color,
    val palette: Palette,
    val textColor: Color? = null,
    val detail: String? = null,
    val trailing: String? = null,
    val onClick: (() -> Unit)? = null,
)

@Composable
private fun SettingsGroupCard(rows: List<SettingsRow>, palette: Palette) {
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(Radii.card))
            .background(palette.surface)
            .border(1.dp, palette.divider.copy(alpha = 0.3f), RoundedCornerShape(Radii.card)),
    ) {
        rows.forEachIndexed { idx, row ->
            if (idx > 0) HorizontalDivider(
                color = palette.divider.copy(alpha = 0.5f),
                modifier = Modifier.padding(start = 56.dp)
            )
            Row(
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = 52.dp)
                    .clickable(
                        enabled = row.onClick != null,
                        role = Role.Button,
                        onClickLabel = row.label,
                        onClick = { row.onClick?.invoke() },
                    )
                    .padding(horizontal = 14.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    Modifier.size(30.dp).clip(RoundedCornerShape(Radii.iconTile)).background(row.tint),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(row.icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
                }
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        row.label,
                        color = row.textColor ?: palette.textPrimary,
                        fontSize = 15.sp, fontWeight = FontWeight.Medium,
                    )
                    row.detail?.let {
                        Text(it, color = palette.textMuted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
                row.trailing?.let {
                    Text(it, color = palette.accent, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                }
                if (row.onClick != null && row.trailing == null) {
                    Icon(
                        Icons.Filled.ChevronRight,
                        contentDescription = null,
                        tint = palette.textMuted,
                        modifier = Modifier.size(16.dp),
                    )
                }
            }
        }
    }
}
