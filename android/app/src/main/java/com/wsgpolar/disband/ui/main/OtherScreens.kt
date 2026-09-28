package com.wsgpolar.disband.ui.main

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Brush
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.wsgpolar.disband.core.Brand
import com.wsgpolar.disband.core.Palette
import com.wsgpolar.disband.core.TimeFormat
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.core.Radii
import com.wsgpolar.disband.data.Note
import com.wsgpolar.disband.state.AppState
import com.wsgpolar.disband.ui.AvatarImage
import com.wsgpolar.disband.ui.collectAsStateValue
import com.wsgpolar.disband.ui.components.ScreenHeader
import kotlinx.coroutines.launch

@Composable
fun YouScreen(app: AppState) {
    val palette = LocalPalette.current
    val profile by app.profile.collectAsStateValue()
    val profileError by app.profileError.collectAsStateValue()
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

    Column(
        Modifier
            .fillMaxSize()
            .background(palette.background)
            .verticalScroll(rememberScrollState())
            .padding(start = 16.dp, end = 16.dp, top = 0.dp, bottom = 96.dp),
    ) {
        ScreenHeader(title = "You")
        HorizontalDivider(color = palette.divider)

        Spacer(Modifier.height(16.dp))

        PlanCard(app, palette)
        Spacer(Modifier.height(16.dp))

        // Profile hero card — mirrors iOS ProfileTab hero (banner, avatar, name, handle, bio)
        profile?.let { p ->
            Box(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(Radii.hero))
                    .background(palette.surface)
                    .border(1.dp, palette.divider.copy(alpha = 0.5f), RoundedCornerShape(Radii.hero)),
            ) {
                Column {
                    // Banner
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .height(88.dp)
                            .background(
                                Brush.horizontalGradient(listOf(palette.accent, palette.accentSoft)),
                            ),
                    )
                    Column(Modifier.padding(horizontal = 16.dp).padding(bottom = 16.dp)) {
                        Box(Modifier.offset(y = (-36).dp)) {
                            Box(
                                Modifier
                                    .size(88.dp)
                                    .clip(CircleShape)
                                    .border(3.dp, palette.surface, CircleShape)
                                    .background(palette.surface),
                                contentAlignment = Alignment.Center,
                            ) {
                                AvatarImage(url = p.avatarUrl, name = p.name, size = 82.dp)
                            }
                        }
                        Text(p.name, color = palette.textPrimary, fontSize = 20.sp, fontWeight = FontWeight.Bold,
                            modifier = Modifier.offset(y = (-16).dp))
                        Text("@" + p.handle, color = palette.textMuted, fontSize = 13.sp)
                        p.bio?.takeIf { it.isNotBlank() }?.let { bio ->
                            Spacer(Modifier.height(8.dp))
                            Text(bio, color = palette.textSecondary, fontSize = 14.sp)
                        }
                    }
                }
            }
            Spacer(Modifier.height(12.dp))
        }

        if (profile == null) {
            Box(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(Radii.card))
                    .background(palette.surface)
                    .padding(16.dp),
            ) {
                Column {
                    Text("Couldn't load your profile", color = palette.textPrimary,
                        fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
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

        // Settings groups — icon tiles match iOS tints
        SettingsGroupCard(
            rows = listOf(
                SettingsRow(Icons.Filled.AccountCircle, "Account", tint = palette.accent, palette = palette) {},
                SettingsRow(Icons.Filled.Brush, "Appearance", tint = Color(0xFF9B59B6), palette = palette) {},
            ),
            palette = palette,
        )
        Spacer(Modifier.height(12.dp))
        SettingsGroupCard(
            rows = listOf(
                SettingsRow(Icons.Filled.Notifications, "Notifications",
                    tint = Color(0xFFF0B232), palette = palette,
                    trailing = if (!notifGranted) "Enable" else null,
                    onClick = if (!notifGranted) ({ requestNotifs.launch(Manifest.permission.POST_NOTIFICATIONS) }) else null),
                SettingsRow(Icons.Filled.Info, "About", tint = Color(0xFF4E5058), palette = palette),
                SettingsRow(Icons.Filled.Language, "disband.dev", tint = Color(0xFF1ABC9C), palette = palette),
            ),
            palette = palette,
        )
        Spacer(Modifier.height(12.dp))
        // Sign out — destructive
        SettingsGroupCard(
            rows = listOf(
                SettingsRow(Icons.Filled.Logout, "Sign out", tint = Brand.dnd, palette = palette,
                    textColor = Brand.dnd) { scope.launch { app.signOut() } },
            ),
            palette = palette,
        )
        Spacer(Modifier.height(16.dp))
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
    val palette: com.wsgpolar.disband.core.Palette,
    val textColor: Color? = null,
    val trailing: String? = null,
    val onClick: (() -> Unit)? = null,
)

@Composable
private fun SettingsGroupCard(rows: List<SettingsRow>, palette: com.wsgpolar.disband.core.Palette) {
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(Radii.card))
            .background(palette.surface)
            .border(1.dp, palette.divider.copy(alpha = 0.3f), RoundedCornerShape(Radii.card)),
    ) {
        rows.forEachIndexed { idx, row ->
            if (idx > 0) HorizontalDivider(color = palette.divider.copy(alpha = 0.5f), modifier = Modifier.padding(start = 56.dp))
            Row(
                Modifier
                    .fillMaxWidth()
                    .clickable(enabled = row.onClick != null, onClick = { row.onClick?.invoke() })
                    .padding(horizontal = 14.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    Modifier.size(30.dp).clip(RoundedCornerShape(Radii.iconTile)).background(row.tint),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(row.icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
                }
                Spacer(Modifier.width(12.dp))
                Text(row.label, color = row.textColor ?: palette.textPrimary, fontSize = 15.sp, fontWeight = FontWeight.Medium,
                    modifier = Modifier.weight(1f))
                row.trailing?.let {
                    Text(it, color = palette.accent, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}