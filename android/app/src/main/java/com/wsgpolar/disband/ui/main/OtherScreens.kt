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