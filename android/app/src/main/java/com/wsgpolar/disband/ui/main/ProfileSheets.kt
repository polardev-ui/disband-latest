package com.wsgpolar.disband.ui.main

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
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
import com.wsgpolar.disband.core.ThemeId
import com.wsgpolar.disband.core.Themes
import com.wsgpolar.disband.data.ProfilePatch
import com.wsgpolar.disband.state.AppState
import com.wsgpolar.disband.ui.collectAsStateValue
import kotlinx.coroutines.launch

/**
 * The sheets behind the You tab's settings rows.
 *
 * Account and Appearance were wired to `{}`, and About and disband.dev had no
 * click handler at all — four of the six rows on that screen did nothing when
 * tapped, and looked identical to the two that worked.
 */

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AccountSheet(app: AppState, onDismiss: () -> Unit) {
    val palette = LocalPalette.current
    val profile by app.profile.collectAsStateValue()
    val scope = rememberCoroutineScope()

    var displayName by remember(profile?.id) { mutableStateOf(profile?.displayName ?: "") }
    var bio by remember(profile?.id) { mutableStateOf(profile?.bio ?: "") }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = palette.surface,
    ) {
        Column(
            Modifier
                .padding(horizontal = 20.dp)
                .padding(bottom = 28.dp)
                .navigationBarsPadding()
        ) {
            Text("Account", color = palette.textPrimary, fontSize = 20.sp, fontWeight = FontWeight.Bold)
            profile?.username?.let {
                Text("@$it", color = palette.textMuted, fontSize = 13.sp)
            }
            Spacer(Modifier.height(18.dp))

            OutlinedTextField(
                value = displayName,
                onValueChange = { displayName = it.take(32) },
                label = { Text("Display name") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = bio,
                onValueChange = {
                    // The server enforces the real limit by plan; this just
                    // stops the field growing without bound.
                    bio = it.take(230)
                },
                label = { Text("About me") },
                minLines = 3,
                maxLines = 5,
                modifier = Modifier.fillMaxWidth(),
            )

            error?.let {
                Spacer(Modifier.height(8.dp))
                Text(it, color = Brand.danger, fontSize = 13.sp)
            }

            Spacer(Modifier.height(18.dp))
            Box(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(palette.accent)
                    .clickable(enabled = !saving) {
                        saving = true
                        error = null
                        scope.launch {
                            error = app.saveProfile(
                                ProfilePatch(
                                    displayName = displayName.trim().ifBlank { null },
                                    bio = bio.trim(),
                                )
                            )
                            saving = false
                            if (error == null) onDismiss()
                        }
                    }
                    .padding(vertical = 14.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    if (saving) "Saving…" else "Save",
                    color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.SemiBold,
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppearanceSheet(app: AppState, onDismiss: () -> Unit) {
    val palette = LocalPalette.current
    val active by app.themeManager.themeId.collectAsStateValue()

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = palette.surface,
    ) {
        Column(Modifier.padding(bottom = 28.dp).navigationBarsPadding()) {
            Text(
                "Appearance", color = palette.textPrimary, fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(horizontal = 20.dp),
            )
            Spacer(Modifier.height(14.dp))

            ThemeId.entries.forEach { id ->
                val definition = Themes.definition(id)
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clickable { app.themeManager.setTheme(id) }
                        .padding(horizontal = 20.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    // A swatch of the theme's own colours says more than its
                    // name — "Nord" and "Ocean" mean nothing until you see them.
                    Row(
                        Modifier
                            .clip(CircleShape)
                            .border(1.dp, palette.divider, CircleShape),
                    ) {
                        listOf(
                            definition.palette.background,
                            definition.palette.surface,
                            definition.palette.accent,
                        ).forEach { swatch ->
                            Box(Modifier.size(width = 14.dp, height = 28.dp).background(swatch))
                        }
                    }
                    Spacer(Modifier.width(14.dp))
                    Text(
                        id.raw.replace('-', ' ').replaceFirstChar { it.uppercase() },
                        color = palette.textPrimary, fontSize = 15.sp,
                        fontWeight = if (id == active) FontWeight.SemiBold else FontWeight.Normal,
                        modifier = Modifier.weight(1f),
                    )
                    if (id == active) {
                        Icon(Icons.Filled.Check, contentDescription = "Selected", tint = palette.accent)
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AboutSheet(versionName: String, versionCode: Int, onDismiss: () -> Unit) {
    val palette = LocalPalette.current
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(),
        containerColor = palette.surface,
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp)
                .padding(bottom = 32.dp)
                .navigationBarsPadding(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text("Disband", color = palette.textPrimary, fontSize = 22.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(4.dp))
            Text(
                "Version $versionName ($versionCode)",
                color = palette.textMuted, fontSize = 14.sp,
            )
            Spacer(Modifier.height(16.dp))
            Text(
                "A place for your people to talk.",
                color = palette.textSecondary, fontSize = 14.sp,
            )
        }
    }
}
