package com.wsgpolar.disband.ui.calls

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.VolumeOff
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.isActive
import com.wsgpolar.disband.call.CallManager
import com.wsgpolar.disband.call.CallPhase
import com.wsgpolar.disband.core.Brand
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.core.Palette
import com.wsgpolar.disband.data.VoiceParticipant
import com.wsgpolar.disband.state.AppState
import com.wsgpolar.disband.ui.AvatarImage
import com.wsgpolar.disband.ui.collectAsStateValue

/**
 * The full-screen stage for a voice channel, matching iOS VoiceStageView.
 */
@Composable
fun VoiceStageView(
    app: AppState,
    channel: com.wsgpolar.disband.data.Channel,
    onMinimize: () -> Unit,
    onBack: () -> Unit,
) {
    val palette = LocalPalette.current
    val scope = rememberCoroutineScope()
    val calls = app.calls
    val micMuted by calls.micMuted.collectAsStateValue()
    val deafened by calls.deafened.collectAsStateValue()
    val speakerOn by calls.speakerOn.collectAsStateValue()
    val phase by calls.phase.collectAsStateValue()
    var elapsed by remember { mutableStateOf(0L) }
    var participants by remember { mutableStateOf<List<com.wsgpolar.disband.data.VoiceParticipant>>(emptyList()) }
    val uid = app.currentUserId

    suspend fun reloadParticipants() {
        participants = runCatching { com.wsgpolar.disband.data.Database.voiceParticipants(channel.id) }.getOrDefault(emptyList())
    }

    LaunchedEffect(channel.id) {
        reloadParticipants()
        while (isActive) {
            delay(4_000)
            reloadParticipants()
        }
    }

    LaunchedEffect(phase) {
        if (phase == CallPhase.Active) {
            while (phase == CallPhase.Active) {
                elapsed++
                delay(1000)
            }
        }
    }

    Column(
        Modifier.fillMaxSize().background(palette.background),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        // Top bar
        Row(
            Modifier.fillMaxWidth()
                .background(palette.surface)
                .statusBarsPadding()
                .height(56.dp)
                .padding(horizontal = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onMinimize) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Minimize",
                    tint = palette.textPrimary)
            }
            Icon(Icons.Filled.GraphicEq, contentDescription = null, tint = palette.accent)
            Column(Modifier.padding(start = 10.dp).weight(1f)) {
                Text("#${channel.name}", color = palette.textPrimary, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                Text(
                    when (phase) {
                        CallPhase.Active -> formatElapsed(elapsed)
                        CallPhase.Outgoing -> "Connecting…"
                        else -> "Voice channel"
                    },
                    color = palette.textMuted, fontSize = 12.sp,
                )
            }
            IconButton(onClick = { scope.launch { calls.toggleSpeaker() } }) {
                Icon(
                    if (speakerOn) Icons.Filled.VolumeUp else Icons.Filled.VolumeOff,
                    contentDescription = if (speakerOn) "Speaker" else "Earpiece",
                    tint = palette.textPrimary,
                )
            }
        }

        HorizontalDivider(color = palette.divider)

        // Participants
        Box(Modifier.fillMaxSize()) {
            LazyColumn(
                state = rememberLazyListState(),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(participants) { participant ->
                    ParticipantTile(participant = participant, palette = palette, micMuted = micMuted)
                }
            }
        }

        // Control bar
        Row(
            Modifier.fillMaxWidth()
                .background(palette.surface)
                .navigationBarsPadding()
                .padding(horizontal = 12.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.SpaceAround,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            ControlButton(
                icon = if (micMuted) Icons.Filled.MicOff else Icons.Filled.Mic,
                label = if (micMuted) "Unmute" else "Mute",
                active = !micMuted,
                alert = micMuted,
                onClick = { calls.toggleMic() },
            )
            ControlButton(
                icon = Icons.Filled.CallEnd,
                label = "Leave",
                active = false,
                alert = true,
                onClick = { scope.launch { app.calls.endCall(); onBack() } },
                big = true,
            )
        }
    }
}

@Composable
private fun ParticipantTile(participant: VoiceParticipant, palette: Palette, micMuted: Boolean) {
    Row(
        Modifier.fillMaxWidth()
            .background(palette.surfaceRaised, RoundedCornerShape(16.dp))
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AvatarImage(url = participant.profile?.avatarUrl, name = participant.profile?.name ?: "Member", size = 40.dp)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(participant.profile?.name ?: "Member", color = palette.textPrimary, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            Text(
                if (micMuted) "Muted" else "Speaking",
                color = palette.textMuted, fontSize = 13.sp,
            )
        }
    }
}

@Composable
private fun ControlButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    active: Boolean,
    alert: Boolean,
    onClick: () -> Unit,
    big: Boolean = false,
) {
    val palette = LocalPalette.current
    val size = if (big) 64.dp else 52.dp
    val bgColor = when {
        alert -> Brand.dnd
        active -> palette.surfaceRaised
        else -> palette.surface
    }
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        IconButton(
            onClick = onClick,
            modifier = Modifier.size(size).clip(CircleShape).background(bgColor),
        ) {
            Icon(icon, contentDescription = null, tint = if (alert) Color.White else palette.textPrimary, modifier = Modifier.size(24.dp))
        }
        Spacer(Modifier.size(4.dp))
        Text(label, color = palette.textSecondary, fontSize = 11.sp)
    }
}

private fun formatElapsed(seconds: Long): String {
    val m = seconds / 60
    val s = seconds % 60
    return "%02d:%02d".format(m, s)
}
