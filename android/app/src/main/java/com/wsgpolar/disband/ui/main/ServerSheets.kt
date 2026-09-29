package com.wsgpolar.disband.ui.main

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Logout
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
    val code = server.inviteCode
    val link = code?.let { "https://www.disband.dev/server/$it" }

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
fun MembersSheet(server: Server, onDismiss: () -> Unit) {
    val palette = LocalPalette.current
    var members by remember(server.id) { mutableStateOf<List<ServerMember>>(emptyList()) }
    var loading by remember(server.id) { mutableStateOf(true) }

    LaunchedEffect(server.id) {
        members = runCatching { Database.members(server.id) }.getOrDefault(emptyList())
        loading = false
    }

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
            Spacer(Modifier.height(8.dp))

            if (loading) {
                Box(Modifier.fillMaxWidth().height(160.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = palette.accent)
                }
            } else {
                LazyColumn(Modifier.fillMaxWidth().heightIn(max = 520.dp)) {
                    items(members, key = { it.id }) { member ->
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 20.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            AvatarImage(
                                url = member.profile?.avatarUrl,
                                name = member.profile?.name ?: "?",
                                size = 38.dp,
                            )
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f)) {
                                Text(
                                    member.profile?.name ?: "Unknown",
                                    color = palette.textPrimary, fontSize = 15.sp,
                                    fontWeight = FontWeight.Medium,
                                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                                )
                                member.profile?.username?.let {
                                    Text("@$it", color = palette.textMuted, fontSize = 12.sp,
                                        maxLines = 1, overflow = TextOverflow.Ellipsis)
                                }
                            }
                            // Owner and admin are worth seeing at a glance;
                            // "member" on every row is noise.
                            if (member.role != MemberRole.Member) {
                                Text(
                                    member.role.name.lowercase(),
                                    color = palette.accent, fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(50))
                                        .background(palette.accent.copy(alpha = 0.15f))
                                        .padding(horizontal = 8.dp, vertical = 3.dp),
                                )
                            }
                        }
                    }
                }
            }
            Spacer(Modifier.height(16.dp))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ServerOverflowSheet(
    app: AppState,
    server: Server,
    onDismiss: () -> Unit,
    onLeft: () -> Unit,
) {
    val palette = LocalPalette.current
    val context = LocalContext.current
    val scope = rememberCoroutineScopeCompat()
    var leaving by remember { mutableStateOf(false) }
    val uid = app.currentUserId
    val isOwner = server.ownerId == uid

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(),
        containerColor = palette.surface,
    ) {
        Column(Modifier.padding(bottom = 28.dp).navigationBarsPadding()) {
            Text(
                server.name, color = palette.textPrimary, fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(horizontal = 20.dp),
            )
            Spacer(Modifier.height(14.dp))

            server.inviteCode?.let { code ->
                OverflowRow("Copy invite link", Icons.Filled.ContentCopy, palette) {
                    copyToClipboard(context, "https://www.disband.dev/server/$code")
                    onDismiss()
                }
            }

            // The owner leaving would orphan the space, so it is not offered —
            // the web deletes instead, which is a bigger action than a sheet
            // like this should carry.
            if (!isOwner && uid != null) {
                OverflowRow(
                    if (leaving) "Leaving…" else "Leave space",
                    Icons.Filled.Logout,
                    palette,
                    tint = Brand.danger,
                ) {
                    if (!leaving) {
                        leaving = true
                        scope.launch {
                            runCatching { Database.leaveServer(server.id, uid) }
                            app.loadServers()
                            leaving = false
                            onDismiss()
                            onLeft()
                        }
                    }
                }
            }
        }
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
            .clickable(onClick = onClick)
            .padding(horizontal = 20.dp, vertical = 14.dp),
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
