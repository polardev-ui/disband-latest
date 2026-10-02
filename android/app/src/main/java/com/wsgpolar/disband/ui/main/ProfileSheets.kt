package com.wsgpolar.disband.ui.main

import android.content.Intent
import android.net.Uri
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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import com.wsgpolar.disband.BuildConfig
import com.wsgpolar.disband.core.Brand
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.core.ThemeId
import com.wsgpolar.disband.core.Themes
import com.wsgpolar.disband.data.Database
import com.wsgpolar.disband.data.MediaService
import com.wsgpolar.disband.data.ProfilePatch
import com.wsgpolar.disband.data.UserStatus
import com.wsgpolar.disband.state.AppState
import com.wsgpolar.disband.ui.collectAsStateValue
import kotlinx.coroutines.launch

/** Downscales an image to maxDim on its long edge, returning JPEG bytes. */
private fun downscale(bytes: ByteArray, maxDim: Int = 1024): ByteArray {
    val bitmap = android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
        ?: return bytes
    val longEdge = maxOf(bitmap.width, bitmap.height)
    if (longEdge <= maxDim) {
        val out = java.io.ByteArrayOutputStream()
        bitmap.compress(android.graphics.Bitmap.CompressFormat.JPEG, 85, out)
        return out.toByteArray()
    }
    val scale = maxDim.toFloat() / longEdge
    val scaled = android.graphics.Bitmap.createScaledBitmap(
        bitmap,
        (bitmap.width * scale).toInt(),
        (bitmap.height * scale).toInt(),
        true,
    )
    val out = java.io.ByteArrayOutputStream()
    scaled.compress(android.graphics.Bitmap.CompressFormat.JPEG, 85, out)
    return out.toByteArray()
}

/**
 * The sheets behind the You tab's settings rows.
 */

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AccountSheet(app: AppState, onDismiss: () -> Unit) {
    val palette = LocalPalette.current
    val profile by app.profile.collectAsStateValue()
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val maxBio = app.subscriptions.entitlements.maxBioLength

    var displayName by remember(profile?.id) { mutableStateOf(profile?.displayName ?: "") }
    var pronouns by remember(profile?.id) { mutableStateOf(profile?.pronouns ?: "") }
    var bio by remember(profile?.id) { mutableStateOf(profile?.bio ?: "") }
    var saving by remember { mutableStateOf(false) }
    var uploading by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    fun uploadUri(uri: android.net.Uri, kind: String) {
        uploading = kind
        error = null
        scope.launch {
            try {
                val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                    ?: throw IllegalStateException("Couldn't read image")
                // Downscale client-side: a 12 MP phone photo as PNG is tens of
                // MB; the server caps Free at 50 MB but the upload is slow and
                // avatars render at 88dp. JPEG at 1024px is plenty.
                val scaled = runCatching { downscale(bytes, 1024) }.getOrDefault(bytes)
                val result = MediaService.uploadImage(scaled, "$kind.jpg", "image/jpeg")
                val patch = if (kind == "avatar") {
                    ProfilePatch(avatarUrl = result.url)
                } else {
                    ProfilePatch(bannerUrl = result.url)
                }
                error = app.saveProfile(patch)
            } catch (e: Exception) {
                error = e.message ?: e.toString()
            }
            uploading = null
        }
    }

    val pickAvatar = androidx.activity.compose.rememberLauncherForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri -> if (uri != null) uploadUri(uri, "avatar") }
    val pickBanner = androidx.activity.compose.rememberLauncherForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri -> if (uri != null) uploadUri(uri, "banner") }

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
            Text("Edit profile", color = palette.textPrimary, fontSize = 20.sp, fontWeight = FontWeight.Bold)
            profile?.username?.let {
                Text("@$it", color = palette.textMuted, fontSize = 13.sp)
            }
            Spacer(Modifier.height(18.dp))

            // Avatar + banner pickers — these were dead taps that opened
            // nothing; the hero's camera pip and banner both land here.
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(
                    onClick = { pickAvatar.launch("image/*") },
                    enabled = uploading == null,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = palette.elevated,
                        contentColor = palette.textPrimary,
                    ),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.weight(1f).heightIn(min = 48.dp),
                ) {
                    if (uploading == "avatar") {
                        CircularProgressIndicator(
                            color = palette.accent,
                            modifier = Modifier.size(18.dp),
                            strokeWidth = 2.dp,
                        )
                    } else {
                        Text("Change avatar", fontSize = 13.sp)
                    }
                }
                Button(
                    onClick = { pickBanner.launch("image/*") },
                    enabled = uploading == null,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = palette.elevated,
                        contentColor = palette.textPrimary,
                    ),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.weight(1f).heightIn(min = 48.dp),
                ) {
                    if (uploading == "banner") {
                        CircularProgressIndicator(
                            color = palette.accent,
                            modifier = Modifier.size(18.dp),
                            strokeWidth = 2.dp,
                        )
                    } else {
                        Text("Change banner", fontSize = 13.sp)
                    }
                }
            }
            Spacer(Modifier.height(16.dp))

            OutlinedTextField(
                value = displayName,
                onValueChange = { displayName = it.take(32) },
                label = { Text("Display name") },
                singleLine = true,
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = pronouns,
                onValueChange = { pronouns = it.take(24) },
                label = { Text("Pronouns (optional)") },
                placeholder = { Text("they/them") },
                singleLine = true,
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = bio,
                onValueChange = { bio = it.take(maxBio) },
                label = { Text("About me") },
                supportingText = { Text("${bio.length} / $maxBio") },
                minLines = 3,
                maxLines = 5,
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier.fillMaxWidth(),
            )

            error?.let {
                Spacer(Modifier.height(8.dp))
                Text(it, color = Brand.danger, fontSize = 13.sp)
            }

            Spacer(Modifier.height(18.dp))
            Button(
                onClick = {
                    saving = true
                    error = null
                    scope.launch {
                        error = app.saveProfile(
                            ProfilePatch(
                                displayName = displayName.trim().ifBlank { null },
                                pronouns = pronouns.trim().ifBlank { null },
                                bio = bio.trim(),
                            )
                        )
                        saving = false
                        if (error == null) onDismiss()
                    }
                },
                enabled = !saving,
                colors = ButtonDefaults.buttonColors(
                    containerColor = palette.accent,
                    contentColor = Color.White,
                    disabledContainerColor = palette.accent.copy(alpha = 0.5f),
                ),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
            ) {
                Text(
                    if (saving) "Saving…" else "Save",
                    fontSize = 15.sp, fontWeight = FontWeight.SemiBold,
                )
            }
        }
    }
}

private enum class StatusExpiry(val label: String, val minutes: Long?) {
    ThirtyMin("30 minutes", 30),
    OneHour("1 hour", 60),
    FourHours("4 hours", 240),
    OneDay("24 hours", 1440),
    Never("Don't clear", null),
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StatusSheet(app: AppState, onDismiss: () -> Unit) {
    val palette = LocalPalette.current
    val profile by app.profile.collectAsStateValue()
    val scope = rememberCoroutineScope()

    var note by remember(profile?.id) { mutableStateOf(profile?.statusNote ?: "") }
    var expiry by remember { mutableStateOf(StatusExpiry.FourHours) }
    var expiryMenu by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = palette.surface,
    ) {
        Column(
            Modifier.padding(horizontal = 20.dp).padding(bottom = 28.dp).navigationBarsPadding()
        ) {
            Text("Set status", color = palette.textPrimary, fontSize = 20.sp, fontWeight = FontWeight.Bold)
            Text(
                "Let people know what you're up to. It clears automatically.",
                color = palette.textMuted, fontSize = 13.sp,
            )
            Spacer(Modifier.height(18.dp))

            OutlinedTextField(
                value = note,
                onValueChange = { note = it.take(128) },
                label = { Text("Status") },
                placeholder = { Text("Low-key lurking") },
                singleLine = true,
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(12.dp))

            // Presence picker — mirrors iOS preferredStatus.
            Text("Show as", color = palette.textMuted, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(6.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf(UserStatus.Online, UserStatus.Idle, UserStatus.Dnd, UserStatus.Offline).forEach { s ->
                    val selected = (profile?.preferredStatus ?: profile?.status) == s
                    Box(
                        Modifier
                            .clip(CircleShape)
                            .background(if (selected) palette.accent else palette.elevated)
                            .clickable(role = Role.Button, onClickLabel = "Show as ${s.label}", onClick = {
                                scope.launch { app.setStatus(s) }
                            })
                            .padding(horizontal = 12.dp, vertical = 8.dp),
                    ) {
                        Text(
                            s.shortLabel,
                            color = if (selected) Color.White else palette.textSecondary,
                            fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
            }
            Spacer(Modifier.height(12.dp))

            Box {
                Box(
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(14.dp))
                        .border(1.dp, palette.divider, RoundedCornerShape(14.dp))
                        .clickable(role = Role.Button, onClickLabel = "Status expiry", onClick = { expiryMenu = true })
                        .padding(horizontal = 14.dp, vertical = 12.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Clear after", color = palette.textMuted, fontSize = 14.sp, modifier = Modifier.weight(1f))
                        Text(expiry.label, color = palette.textPrimary, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
                androidx.compose.material3.DropdownMenu(
                    expanded = expiryMenu,
                    onDismissRequest = { expiryMenu = false },
                ) {
                    StatusExpiry.entries.forEach { option ->
                        androidx.compose.material3.DropdownMenuItem(
                            text = { Text(option.label) },
                            onClick = { expiry = option; expiryMenu = false },
                            trailingIcon = {
                                if (option == expiry) Icon(Icons.Filled.Check, contentDescription = null, tint = palette.accent)
                            },
                        )
                    }
                }
            }

            error?.let {
                Spacer(Modifier.height(8.dp))
                Text(it, color = Brand.danger, fontSize = 13.sp)
            }
            Spacer(Modifier.height(18.dp))

            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                if (!profile?.statusNote.isNullOrBlank()) {
                    androidx.compose.material3.OutlinedButton(
                        onClick = {
                            saving = true
                            scope.launch {
                                val uid = app.currentUserId
                                error = if (uid == null) "Not signed in"
                                else runCatching { Database.clearStatus(uid); app.loadProfile(); null }.getOrElse { e -> e.message }
                                saving = false
                                if (error == null) onDismiss()
                            }
                        },
                        enabled = !saving,
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.weight(1f).heightIn(min = 48.dp),
                    ) {
                        Text("Clear", color = Brand.dnd)
                    }
                }
                Button(
                    onClick = {
                        saving = true
                        error = null
                        scope.launch {
                            val expiresAt = expiry.minutes?.let {
                                java.time.OffsetDateTime.now().plusMinutes(it).toString()
                            }
                            error = app.saveProfile(
                                ProfilePatch(
                                    statusNote = note.trim().ifBlank { null },
                                    statusExpiresAt = expiresAt,
                                )
                            )
                            saving = false
                            if (error == null) onDismiss()
                        }
                    },
                    enabled = !saving,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = palette.accent,
                        contentColor = Color.White,
                        disabledContainerColor = palette.accent.copy(alpha = 0.5f),
                    ),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.weight(2f).heightIn(min = 48.dp),
                ) {
                    Text(if (saving) "Saving…" else "Set status", fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReferralsSheet(app: AppState, onDismiss: () -> Unit) {
    val palette = LocalPalette.current
    val uid = app.currentUserId
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    var code by remember { mutableStateOf<String?>(null) }
    var count by remember { mutableStateOf<Int?>(null) }

    LaunchedEffect(uid) {
        if (uid == null) return@LaunchedEffect
        code = Database.referralCode(uid)
        count = Database.referralCount(uid)
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = palette.surface,
    ) {
        Column(
            Modifier.padding(horizontal = 20.dp).padding(bottom = 28.dp).navigationBarsPadding(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text("Referrals", color = palette.textPrimary, fontSize = 20.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(6.dp))
            Text(
                "Share your code — every 2 verified referrals earns a raffle entry.",
                color = palette.textMuted, fontSize = 13.sp,
            )
            Spacer(Modifier.height(18.dp))
            if (code == null) {
                CircularProgressIndicator(color = palette.accent, modifier = Modifier.size(24.dp))
            } else {
                Box(
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(14.dp))
                        .background(palette.elevated)
                        .padding(16.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        code ?: "",
                        color = palette.textPrimary,
                        fontSize = 24.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 2.sp,
                    )
                }
                Spacer(Modifier.height(8.dp))
                Text(
                    "${count ?: 0} verified referral${if ((count ?: 0) == 1) "" else "s"}",
                    color = palette.textSecondary, fontSize = 13.sp,
                )
                Spacer(Modifier.height(16.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    androidx.compose.material3.OutlinedButton(
                        onClick = { clipboard.setText(AnnotatedString(code ?: "")) },
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.weight(1f).heightIn(min = 48.dp),
                    ) {
                        Icon(Icons.Filled.ContentCopy, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Copy")
                    }
                    Button(
                        onClick = {
                            context.startActivity(
                                Intent(Intent.ACTION_SEND).apply {
                                    type = "text/plain"
                                    putExtra(Intent.EXTRA_TEXT, "Join me on Disband with my code ${code ?: ""}: https://www.disband.dev")
                                }.let { Intent.createChooser(it, "Share referral code") }
                            )
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = palette.accent, contentColor = Color.White),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.weight(1f).heightIn(min = 48.dp),
                    ) {
                        Icon(Icons.Filled.Share, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Share")
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppearanceSheet(app: AppState, onDismiss: () -> Unit) {
    val palette = LocalPalette.current
    val scope = rememberCoroutineScope()
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
            Text(
                "Aero unlocks every theme. Free keeps Dark, AMOLED, Light and Sunset.",
                color = palette.textMuted, fontSize = 13.sp,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp),
            )
            Spacer(Modifier.height(10.dp))

            val isPaid = app.subscriptions.plan.isPaid
            ThemeId.entries.forEach { id ->
                val definition = Themes.definition(id)
                val locked = id !in Themes.freeThemeIds && !isPaid
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clickable(
                            enabled = !locked,
                            role = Role.Button,
                            onClickLabel = "Use ${definition.label}",
                            onClick = {
                                app.themeManager.setTheme(id)
                                scope.launch { runCatching { app.updateTheme(id.raw) } }
                            },
                        )
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
                    Column(Modifier.weight(1f)) {
                        Text(
                            definition.label,
                            color = if (locked) palette.textMuted else palette.textPrimary,
                            fontSize = 15.sp,
                            fontWeight = if (id == active) FontWeight.SemiBold else FontWeight.Normal,
                        )
                        if (locked) {
                            Text("Aero", color = Brand.gold, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                    if (id == active) {
                        Icon(Icons.Filled.Check, contentDescription = "Selected ${definition.label}", tint = palette.accent)
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationsSheet(app: AppState, onDismiss: () -> Unit) {
    val palette = LocalPalette.current
    val profile by app.profile.collectAsStateValue()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var sound by remember(profile?.id) { mutableStateOf(profile?.soundEnabled ?: true) }
    var desktop by remember(profile?.id) { mutableStateOf(profile?.desktopNotificationsEnabled ?: true) }
    var previews by remember(profile?.id) { mutableStateOf(profile?.linkPreviewsEnabled ?: true) }
    var saving by remember { mutableStateOf(false) }

    fun persist() {
        saving = true
        scope.launch {
            app.saveProfile(
                ProfilePatch(
                    soundEnabled = sound,
                    desktopNotificationsEnabled = desktop,
                    linkPreviewsEnabled = previews,
                )
            )
            saving = false
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = palette.surface,
    ) {
        Column(Modifier.padding(horizontal = 20.dp).padding(bottom = 28.dp).navigationBarsPadding()) {
            Text("Notifications & chat", color = palette.textPrimary, fontSize = 20.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(14.dp))

            ToggleRow("Sounds", "Play sounds for messages and calls", sound, palette) {
                sound = it; persist()
            }
            ToggleRow("Desktop notifications", "Show a notification for mentions and DMs", desktop, palette) {
                desktop = it; persist()
            }
            ToggleRow("Link previews", "Expand links into rich previews", previews, palette) {
                previews = it; persist()
            }
            Spacer(Modifier.height(12.dp))
            androidx.compose.material3.OutlinedButton(
                onClick = {
                    context.startActivity(
                        Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                            .putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, context.packageName)
                    )
                },
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
            ) {
                Text("System notification settings", color = palette.textPrimary)
            }
        }
    }
}

@Composable
private fun ToggleRow(
    title: String,
    detail: String,
    checked: Boolean,
    palette: com.wsgpolar.disband.core.Palette,
    onChange: (Boolean) -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, color = palette.textPrimary, fontSize = 15.sp, fontWeight = FontWeight.Medium)
            Text(detail, color = palette.textMuted, fontSize = 12.sp)
        }
        Switch(checked = checked, onCheckedChange = onChange)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AboutSheet(versionName: String, versionCode: Int, onDismiss: () -> Unit) {
    val palette = LocalPalette.current
    val context = LocalContext.current
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
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
            Spacer(Modifier.height(12.dp))
            Text(
                "A place for your people to talk.",
                color = palette.textSecondary, fontSize = 14.sp,
            )
            Spacer(Modifier.height(16.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                androidx.compose.material3.OutlinedButton(
                    onClick = {
                        context.startActivity(
                            Intent(Intent.ACTION_VIEW, Uri.parse("https://www.disband.dev/terms"))
                        )
                    },
                    shape = RoundedCornerShape(50),
                ) { Text("Terms", color = palette.textPrimary, fontSize = 13.sp) }
                androidx.compose.material3.OutlinedButton(
                    onClick = {
                        context.startActivity(
                            Intent(Intent.ACTION_VIEW, Uri.parse("https://www.disband.dev/privacy"))
                        )
                    },
                    shape = RoundedCornerShape(50),
                ) { Text("Privacy", color = palette.textPrimary, fontSize = 13.sp) }
                androidx.compose.material3.OutlinedButton(
                    onClick = {
                        context.startActivity(
                            Intent(Intent.ACTION_VIEW, Uri.parse("https://www.disband.dev"))
                        )
                    },
                    shape = RoundedCornerShape(50),
                ) { Text("Website", color = palette.textPrimary, fontSize = 13.sp) }
            }
        }
    }
}
