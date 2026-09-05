package com.wsgpolar.disband.ui.calls

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material.icons.filled.VolumeOff
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
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
import com.wsgpolar.disband.call.CallPhase
import com.wsgpolar.disband.core.Brand
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.state.AppState
import com.wsgpolar.disband.ui.AvatarImage
import com.wsgpolar.disband.ui.collectAsStateValue
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Full-screen call UI, drawn over everything in [com.wsgpolar.disband.ui.main.MainScreen].
 * Shows the incoming / outgoing / active states and the in-call controls.
 */
@Composable
fun CallOverlay(app: AppState) {
    val phase by app.calls.phase.collectAsStateValue()
    if (phase == CallPhase.Idle) return

    val incoming by app.calls.incoming.collectAsStateValue()
    val peer by app.calls.activePeer.collectAsStateValue()
    val notice by app.calls.callNotice.collectAsStateValue()
    val error by app.calls.error.collectAsStateValue()
    val micMuted by app.calls.micMuted.collectAsStateValue()
    val deafened by app.calls.deafened.collectAsStateValue()
    val speakerOn by app.calls.speakerOn.collectAsStateValue()
    val connectedAt by app.calls.connectedAt.collectAsStateValue()

    val palette = LocalPalette.current
    val scope = rememberCoroutineScope()
    var elapsed by remember { mutableLongStateOf(0L) }

    LaunchedEffect(phase, connectedAt) {
        while (phase == CallPhase.Active && connectedAt != null) {
            elapsed = (System.currentTimeMillis() - connectedAt!!) / 1000
            delay(1_000)
        }
    }

    val name = when (phase) {
        CallPhase.Incoming -> incoming?.callerName ?: "Incoming call"
        CallPhase.Outgoing -> peer?.name ?: "Calling…"
        else -> peer?.name ?: "Call"
    }
    val avatarUrl = when (phase) {
        CallPhase.Incoming -> incoming?.profile?.avatarUrl
        else -> peer?.avatarUrl
    }
    val avatarName = name

    Box(Modifier.fillMaxSize().background(palette.background).imePadding().statusBarsPadding()) {
        if (phase == CallPhase.Active) {
            Column(Modifier.align(Alignment.TopStart).padding(8.dp)) {
                IconButton(onClick = { scope.launch { app.calls.endCall() } }) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "End call",
                        tint = palette.textMuted)
                }
            }
        }

        Column(
            Modifier.fillMaxSize().padding(horizontal = 32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.size(48.dp))
            AvatarImage(url = avatarUrl, name = avatarName, size = 120.dp)
            Spacer(Modifier.size(28.dp))
            Text(name, color = palette.textPrimary, fontSize = 26.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.size(10.dp))
            Text(
                when (phase) {
                    CallPhase.Incoming -> "${incoming?.callerName ?: "Caller"} is calling you"
                    CallPhase.Outgoing -> "Ringing…"
                    CallPhase.Active -> formatElapsed(elapsed)
                    else -> ""
                },
                color = palette.textMuted,
                fontSize = 15.sp,
            )

            notice?.let {
                Spacer(Modifier.size(12.dp))
                Text(it, color = palette.textPrimary, fontSize = 15.sp, fontWeight = FontWeight.Medium)
            }
            error?.let {
                Spacer(Modifier.size(12.dp))
                Text(it, color = Brand.danger, fontSize = 14.sp)
            }

            Spacer(Modifier.weight(1f))

            when (phase) {
                CallPhase.Incoming -> {
                    val call = incoming
                    if (call != null) {
                        Row {
                            RoundControl(label = "Decline", color = Brand.danger,
                                icon = { Icon(Icons.Filled.CallEnd, contentDescription = null, tint = Color.White) },
                                onClick = { scope.launch { app.calls.rejectCall(call) } })
                            Spacer(Modifier.width(48.dp))
                            RoundControl(label = "Accept", color = Brand.online,
                                icon = { Icon(Icons.Filled.Call, contentDescription = null, tint = Color.White) },
                                onClick = { scope.launch { app.calls.acceptCall(call) } })
                        }
                    }
                }
                else -> {
                    Row {
                        RoundControl(label = if (micMuted) "Unmute" else "Mute",
                            color = if (micMuted) palette.accent else palette.surfaceRaised,
                            icon = {
                                Icon(
                                    if (micMuted) Icons.Filled.MicOff else Icons.Filled.Mic,
                                    contentDescription = null,
                                    tint = palette.textPrimary,
                                )
                            },
                            onClick = { app.calls.toggleMic() })
                        Spacer(Modifier.width(20.dp))
                        RoundControl(label = if (deafened) "Undeafen" else "Deafen",
                            color = if (deafened) palette.accent else palette.surfaceRaised,
                            icon = {
                                Icon(
                                    if (deafened) Icons.Filled.VolumeOff else Icons.Filled.VolumeUp,
                                    contentDescription = null,
                                    tint = palette.textPrimary,
                                )
                            },
                            onClick = { app.calls.toggleDeafen() })
                        Spacer(Modifier.width(20.dp))
                        RoundControl(label = if (speakerOn) "Speaker" else "Earpiece",
                            color = if (speakerOn) palette.accent else palette.surfaceRaised,
                            icon = {
                                Icon(
                                    if (speakerOn) Icons.Filled.VolumeUp else Icons.Filled.VolumeOff,
                                    contentDescription = null,
                                    tint = palette.textPrimary,
                                )
                            },
                            onClick = { app.calls.toggleSpeaker() })
                    }
                    Spacer(Modifier.size(28.dp))
                    RoundControl(label = "End", color = Brand.danger, big = true,
                        icon = { Icon(Icons.Filled.CallEnd, contentDescription = null, tint = Color.White) },
                        onClick = { scope.launch { app.calls.endCall() } })
                }
            }
            Spacer(Modifier.size(36.dp))
        }
    }
}

@Composable
private fun RoundControl(
    label: String,
    color: Color,
    icon: @Composable () -> Unit,
    onClick: () -> Unit,
    big: Boolean = false,
) {
    val palette = LocalPalette.current
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        IconButton(
            onClick = onClick,
            modifier = Modifier
                .size(if (big) 64.dp else 52.dp)
                .clip(CircleShape)
                .background(color),
        ) {
            icon()
        }
        Spacer(Modifier.size(6.dp))
        Text(label, color = palette.textSecondary, fontSize = 12.sp)
    }
}

private fun formatElapsed(seconds: Long): String {
    val m = seconds / 60
    val s = seconds % 60
    return "%02d:%02d".format(m, s)
}