package com.wsgpolar.disband.ui.calls

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wsgpolar.disband.core.Brand
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.state.AppState
import com.wsgpolar.disband.ui.AvatarImage
import com.wsgpolar.disband.ui.collectAsStateValue

/**
 * Full-screen group call. Shows while this device is in a group call and the
 * user hasn't minimised it; reuses the voice channel's in-call UI.
 */
@Composable
fun GroupCallOverlay(app: AppState, open: Boolean, onOpenChange: (Boolean) -> Unit) {
    val voice = app.voice
    val room by voice.room.collectAsStateValue()
    val error by voice.error.collectAsStateValue()
    val groupRoom = room?.takeIf { it.isGroup }

    // A new group call opens full-screen; leaving it closes the screen.
    LaunchedEffect(groupRoom?.channelId) { onOpenChange(groupRoom != null) }

    if (groupRoom != null && open) {
        BackHandler { onOpenChange(false) }
        Box(Modifier.fillMaxSize()) {
            InCall(app, voice, groupRoom.name) { onOpenChange(false) }
        }
    }

    // Join failures (e.g. mid DM call) surface here; a voice channel's own
    // screen reports errors while one of those is joined.
    if (room == null || groupRoom != null) {
        error?.let { message ->
            AlertDialog(
                onDismissRequest = { voice.clearError() },
                confirmButton = { TextButton(onClick = { voice.clearError() }) { Text("OK") } },
                text = { Text(message) },
            )
        }
    }
}

/** "X started a call" banner, shown app-wide while the app is open. */
@Composable
fun GroupRingBanner(app: AppState, modifier: Modifier = Modifier) {
    val ring by app.voice.incomingRing.collectAsStateValue()
    val current = ring ?: return
    val palette = LocalPalette.current
    val join = rememberAudioPermissionTrigger {
        app.voice.join(com.wsgpolar.disband.call.VoiceRoom.group(current.groupId, current.groupName, null))
    }

    Row(
        modifier
            .statusBarsPadding()
            .padding(horizontal = 12.dp, vertical = 8.dp)
            .fillMaxWidth()
            .clip(RoundedCornerShape(26.dp))
            .background(palette.surface)
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AvatarImage(url = null, name = current.groupName, size = 46.dp)
        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
            Text(current.groupName, color = palette.textPrimary, fontSize = 16.sp,
                maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text("${current.callerName} started a call", color = palette.textMuted, fontSize = 13.sp,
                maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        RingButton(Icons.Filled.Close, Brand.dnd, "Decline") { app.voice.declineRing() }
        Box(Modifier.size(8.dp))
        RingButton(Icons.Filled.Call, Brand.online, "Join call") { join() }
    }
}

@Composable
private fun RingButton(icon: androidx.compose.ui.graphics.vector.ImageVector, color: Color, label: String, onClick: () -> Unit) {
    Box(
        Modifier.size(44.dp).clip(CircleShape).background(color)
            .clickable(role = Role.Button, onClickLabel = label, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = label, tint = Color.White, modifier = Modifier.size(20.dp))
    }
}
