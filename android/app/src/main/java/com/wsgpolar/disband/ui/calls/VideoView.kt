package com.wsgpolar.disband.ui.calls

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.wsgpolar.disband.call.VideoEgl
import org.webrtc.RendererCommon
import org.webrtc.SurfaceViewRenderer
import org.webrtc.VideoTrack

/**
 * Renders one WebRTC video track: a participant's camera or screen. The
 * Android counterpart of iOS `MeshVideoView`. Screens are never cropped;
 * faces fill their tile.
 */
@Composable
fun VideoTrackView(track: VideoTrack, modifier: Modifier = Modifier, fit: Boolean = false, mirrored: Boolean = false) {
    val holder = remember { arrayOfNulls<VideoTrack>(1) }
    AndroidView(
        modifier = modifier,
        factory = { context ->
            SurfaceViewRenderer(context).apply {
                init(VideoEgl.base.eglBaseContext, null)
                setEnableHardwareScaler(true)
            }
        },
        update = { view ->
            view.setScalingType(
                if (fit) RendererCommon.ScalingType.SCALE_ASPECT_FIT else RendererCommon.ScalingType.SCALE_ASPECT_FILL,
            )
            view.setMirror(mirrored)
            if (holder[0] !== track) {
                holder[0]?.let { old -> runCatching { old.removeSink(view) } }
                runCatching { track.addSink(view) }
                holder[0] = track
            }
        },
        onRelease = { view ->
            holder[0]?.let { old -> runCatching { old.removeSink(view) } }
            holder[0] = null
            view.release()
        },
    )
}

/** A labelled video tile in a call. */
@Composable
fun VideoTile(
    track: VideoTrack,
    label: String,
    screen: Boolean,
    modifier: Modifier = Modifier,
    mirrored: Boolean = false,
    onClick: (() -> Unit)? = null,
) {
    Box(
        modifier.fillMaxWidth().aspectRatio(16f / 9f).clip(RoundedCornerShape(16.dp)).background(Color.Black)
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier),
    ) {
        VideoTrackView(track, Modifier.fillMaxSize(), fit = screen, mirrored = mirrored)
        Text(
            label, color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
            modifier = Modifier.align(Alignment.BottomStart).padding(8.dp)
                .clip(RoundedCornerShape(8.dp)).background(Color.Black.copy(alpha = 0.55f))
                .padding(horizontal = 8.dp, vertical = 3.dp),
        )
    }
}

/** A screen share or camera, full screen, until closed. */
@Composable
fun FullScreenVideo(track: VideoTrack, label: String, screen: Boolean, onClose: () -> Unit) {
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(Modifier.fillMaxSize().background(Color.Black)) {
            VideoTrackView(track, Modifier.fillMaxSize(), fit = screen)
            Text(label, color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold,
                modifier = Modifier.align(Alignment.TopStart).statusBarsPadding().padding(16.dp))
            IconButton(onClick = onClose, modifier = Modifier.align(Alignment.TopEnd).statusBarsPadding().padding(8.dp)) {
                Icon(Icons.Filled.Close, contentDescription = "Close", tint = Color.White)
            }
        }
    }
}
