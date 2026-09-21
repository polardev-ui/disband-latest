package com.wsgpolar.disband.ui.calls

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.repeatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.width
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wsgpolar.disband.core.Brand
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.data.VoiceParticipant
import com.wsgpolar.disband.ui.AvatarImage
import kotlinx.coroutines.flow.StateFlow

/**
 * A connected call, minimised: always reachable, never in the way.
 * Shown at the bottom of the screen when in a voice channel.
 */
@Composable
fun VoicePill(
    participantCount: Int,
    channelName: String,
    micMuted: Boolean,
    onToggleMute: () -> Unit,
    onLeave: () -> Unit,
    onReturn: () -> Unit,
) {
    val palette = LocalPalette.current
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 14.dp, vertical = 8.dp)
            .clip(CircleShape)
            .background(palette.surfaceRaised.copy(alpha = 0.9f)),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onReturn, modifier = Modifier.padding(start = 14.dp)) {
            AvatarImage(url = null, name = channelName, size = 28.dp)
        }
        Spacer(Modifier.width(10.dp))
        Column {
            Text(channelName, color = palette.textPrimary, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
            Text(
                if (micMuted) "Muted · $participantCount ${if (participantCount == 1) "person" else "people"}"
                else "$participantCount ${if (participantCount == 1) "person" else "people"} here",
                color = Brand.online, fontSize = 12.sp,
            )
        }
        Spacer(Modifier.weight(1f))
        IconButton(onClick = onToggleMute) {
            Icon(
                if (micMuted) Icons.Filled.MicOff else Icons.Filled.Mic,
                contentDescription = if (micMuted) "Unmute" else "Mute",
                tint = if (micMuted) Brand.dnd else palette.textPrimary,
                modifier = Modifier.size(24.dp),
            )
        }
        IconButton(onClick = onLeave) {
            Icon(Icons.Filled.CallEnd, contentDescription = "Leave",
                tint = Brand.dnd, modifier = Modifier.size(22.dp))
        }
        Spacer(Modifier.width(6.dp))
    }
}

/**
 * A live dot that breathes while anyone is speaking.
 */
@Composable
fun SpeakingPulse(active: Boolean) {
    if (!active) return
    val scale by animateFloatAsState(
        targetValue = if (active) 1.25f else 0.7f,
        animationSpec = repeatable(
            iterations = Int.MAX_VALUE,
            animation = tween(durationMillis = 800),
        ),
        label = "pulse",
    )
    androidx.compose.foundation.layout.Box(
        Modifier
            .size(22.dp)
            .clip(CircleShape)
            .background(Brand.online.copy(alpha = 0.35f)),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            Icons.Filled.GraphicEq,
            contentDescription = null,
            tint = Color.White,
            modifier = Modifier.size(11.dp),
        )
    }
}
