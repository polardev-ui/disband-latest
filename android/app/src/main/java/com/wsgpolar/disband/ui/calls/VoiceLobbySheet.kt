package com.wsgpolar.disband.ui.calls

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
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
import com.wsgpolar.disband.core.Palette
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.data.VoiceParticipant
import com.wsgpolar.disband.state.AppState
import com.wsgpolar.disband.ui.AvatarImage
import kotlinx.coroutines.launch

/**
 * Peek into a voice channel before joining: who's there, and one
 * big button to join. Muting first is a tap away, so nobody hears
 * you arrive.
 */
@Composable
fun VoiceLobbySheet(
    app: AppState,
    channelName: String,
    participants: List<VoiceParticipant>,
    onJoin: () -> Unit,
    onDismiss: () -> Unit,
) {
    val palette = LocalPalette.current
    val scope = rememberCoroutineScope()
    var joinMuted by remember { mutableStateOf(false) }
    var joining by remember { mutableStateOf(false) }

    Column(
        Modifier
            .fillMaxWidth()
            .background(palette.surface),
    ) {
        // Header
        Column(
            Modifier.padding(horizontal = 24.dp).padding(top = 28.dp, bottom = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            AvatarCluster(members = participants, size = 64.dp)
            Spacer(Modifier.size(14.dp))
            Text(channelName, color = palette.textPrimary, fontSize = 22.sp, fontWeight = FontWeight.Bold)
            Text(
                memberSummary(participants),
                color = palette.textMuted, fontSize = 14.sp,
            )
        }

        // Member list
        LazyColumn(
            Modifier.weight(1f),
            contentPadding = PaddingValues(horizontal = 24.dp, vertical = 8.dp),
        ) {
            items(participants) { member ->
                MemberRow(member = member, palette = palette)
            }
        }

        // Controls
        Row(
            Modifier.fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(
                onClick = { joinMuted = !joinMuted },
                modifier = Modifier.size(58.dp).clip(CircleShape).background(if (joinMuted) Brand.dnd else palette.surfaceRaised),
            ) {
                Icon(
                    if (joinMuted) Icons.Filled.MicOff else Icons.Filled.Mic,
                    contentDescription = if (joinMuted) "Join muted" else "Join unmuted",
                    tint = if (joinMuted) Color.White else palette.textPrimary,
                    modifier = Modifier.size(22.dp),
                )
            }
            androidx.compose.material3.Button(
                onClick = {
                    joining = true
                    scope.launch {
                        onJoin()
                        joining = false
                    }
                },
                enabled = !joining,
                modifier = Modifier.weight(1f).height(58.dp),
                shape = CircleShape,
            ) {
                if (joining) {
                    androidx.compose.material3.CircularProgressIndicator(
                        color = Color.White, modifier = Modifier.size(22.dp),
                    )
                } else {
                    Icon(Icons.Filled.GraphicEq, contentDescription = null, tint = Color.White, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Join Voice", color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
private fun AvatarCluster(members: List<VoiceParticipant>, size: androidx.compose.ui.unit.Dp) {
    val palette = LocalPalette.current
    if (members.isEmpty()) {
        Box(
            Modifier.size(size * 1.5f).clip(CircleShape).background(palette.accent.copy(alpha = 0.15f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Filled.GraphicEq, contentDescription = null, tint = palette.accent, modifier = Modifier.size(size * 0.5f))
        }
    } else {
        val shown = members.take(4)
        Box(Modifier.size(size * 1.5f)) {
            shown.forEachIndexed { index, member ->
                val offsetX = when (index) {
                    0 -> 0f
                    1 -> -18f
                    2 -> -14f
                    3 -> -16f
                    else -> 0f
                }
                val offsetY = when (index) {
                    0 -> 0f
                    1 -> -6f
                    2 -> -12f
                    3 -> -12f
                    else -> 0f
                }
                Box(
                    Modifier
                        .offset(offsetX.dp, offsetY.dp)
                        .size(if (index == 0) size else size * 0.72f),
                ) {
                    AvatarImage(url = member.profile?.avatarUrl, name = member.profile?.name ?: "Member", size = size)
                }
            }
        }
    }
}

@Composable
private fun MemberRow(member: VoiceParticipant, palette: Palette) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AvatarImage(url = member.profile?.avatarUrl, name = member.profile?.name ?: "Member", size = 36.dp)
        Spacer(Modifier.width(12.dp))
        Text(member.profile?.name ?: "Member", color = palette.textPrimary, fontSize = 15.sp, fontWeight = FontWeight.Medium)
    }
}

private fun memberSummary(members: List<VoiceParticipant>): String {
    return when (members.size) {
        0 -> "No one's here yet — be the first."
        1 -> "${members[0].profile?.name ?: "Someone"} is hanging out"
        2 -> "${members[0].profile?.name} and ${members[1].profile?.name}"
        else -> "${members[0].profile?.name}, ${members[1].profile?.name} and ${members.size - 2} others"
    }
}
