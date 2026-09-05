package com.wsgpolar.disband.ui.main

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wsgpolar.disband.core.Brand
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.core.Palette
import com.wsgpolar.disband.core.color
import com.wsgpolar.disband.data.Channel
import com.wsgpolar.disband.data.Database
import com.wsgpolar.disband.data.VoiceParticipant
import com.wsgpolar.disband.state.AppState
import com.wsgpolar.disband.ui.AvatarImage
import com.wsgpolar.disband.ui.collectAsStateValue
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.isActive

/**
 * Voice channel presence view: join on open, list live participants, leave on exit.
 * (Audio transport is a 1:1 WebRTC call; mesh streaming ships separately.)
 */
@Composable
fun VoiceChannelScreen(app: AppState, channel: Channel, onBack: () -> Unit) {
    val uid = app.currentUserId ?: return
    val palette = LocalPalette.current
    val scope = rememberCoroutineScope()
    val presence = app.presence

    var participants by remember(channel.id) { mutableStateOf<List<VoiceParticipant>>(emptyList()) }
    var loading by remember(channel.id) { mutableStateOf(true) }

    suspend fun reload() {
        participants = runCatching { Database.voiceParticipants(channel.id) }.getOrDefault(emptyList())
        loading = false
    }

    LaunchedEffect(channel.id) {
        runCatching { Database.joinVoice(channel.id, uid) }
        reload()
        while (isActive) {
            delay(4_000)
            reload()
        }
    }

    DisposableEffect(channel.id) {
        onDispose {
            scope.launch { runCatching { Database.leaveVoice(channel.id, uid) } }
        }
    }

    Column(Modifier.fillMaxSize().background(palette.background)) {
        Row(
            Modifier
                .fillMaxWidth()
                .background(palette.surface)
                .statusBarsPadding()
                .height(56.dp)
                .padding(horizontal = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back",
                    tint = palette.textPrimary)
            }
            Icon(Icons.Filled.GraphicEq, contentDescription = null, tint = palette.accent)
            Column(Modifier.padding(start = 10.dp).weight(1f)) {
                Text("#${channel.name}", color = palette.textPrimary, fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold)
                Text("Voice channel", color = palette.textMuted, fontSize = 12.sp)
            }
        }
        HorizontalDivider(color = palette.divider)

        if (loading) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = palette.accent)
            }
        } else {
            Column(Modifier.fillMaxWidth().padding(16.dp)) {
                Box(Modifier.fillMaxWidth().background(palette.surface, androidx.compose.foundation.shape.RoundedCornerShape(12.dp)).padding(14.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(10.dp).background(Brand.online, androidx.compose.foundation.shape.CircleShape))
                        Text("  Connected · ${participants.size} ${if (participants.size == 1) "person" else "people"} here",
                            color = palette.textSecondary, fontSize = 13.sp)
                    }
                }
                Spacer(Modifier.height(12.dp))
                Text("In this channel", color = palette.textMuted, fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold)
            }
            LazyColumn(Modifier.fillMaxSize()) {
                items(participants, key = { it.id }) { participant ->
                    ParticipantRow(palette = palette, participant = participant)
                }
            }
        }
    }
}

@Composable
private fun ParticipantRow(palette: Palette, participant: VoiceParticipant) {
    val presence = participant.profile?.status?.color(palette) ?: palette.textMuted
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AvatarImage(
            url = participant.profile?.avatarUrl,
            name = participant.profile?.name ?: "?",
            size = 40.dp,
            presence = presence,
        )
        Column(Modifier.padding(start = 10.dp).weight(1f)) {
            Text(participant.profile?.name ?: "Member", color = palette.textPrimary, fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold)
            Text(participant.profile?.handle?.let { "@$it" } ?: "", color = palette.textMuted, fontSize = 12.sp)
        }
    }
    HorizontalDivider(color = palette.divider, modifier = Modifier.padding(start = 66.dp))
}