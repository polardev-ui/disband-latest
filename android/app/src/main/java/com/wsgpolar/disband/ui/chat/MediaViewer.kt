package com.wsgpolar.disband.ui.chat

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.OpenInBrowser
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import coil.compose.AsyncImagePainter
import com.wsgpolar.disband.data.StoredAttachment

/** Image and GIF attachments open in [MediaViewer]; anything else goes to another app. */
internal fun StoredAttachment.opensInViewer(): Boolean = type == "image" || type == "gif"

/**
 * Full-screen viewer for a picture in a chat, like iOS's MediaViewer. Tapping
 * a photo used to hand its URL to the browser. Pinch or double-tap to zoom,
 * drag to pan when zoomed, tap the background or X to close.
 */
@Composable
fun MediaViewer(attachment: StoredAttachment, onDismiss: () -> Unit, onOpenExternally: () -> Unit) {
    val context = LocalContext.current
    var scale by remember { mutableFloatStateOf(1f) }
    var offset by remember { mutableStateOf(Offset.Zero) }
    var state by remember { mutableStateOf<AsyncImagePainter.State?>(null) }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false),
    ) {
        Box(Modifier.fillMaxSize().background(Color.Black)) {
            AsyncImage(
                model = attachment.url,
                contentDescription = attachment.name ?: "Image",
                contentScale = ContentScale.Fit,
                onState = { state = it },
                modifier = Modifier
                    .fillMaxSize()
                    .pointerInput(Unit) {
                        detectTransformGestures { _, pan, zoom, _ ->
                            scale = (scale * zoom).coerceIn(1f, 5f)
                            // Panning only means something when zoomed in.
                            offset = if (scale > 1f) offset + pan else Offset.Zero
                        }
                    }
                    .pointerInput(Unit) {
                        detectTapGestures(
                            onDoubleTap = {
                                if (scale > 1f) { scale = 1f; offset = Offset.Zero } else scale = 2.5f
                            },
                            onTap = { if (scale == 1f) onDismiss() },
                        )
                    }
                    .graphicsLayer {
                        scaleX = scale
                        scaleY = scale
                        translationX = offset.x
                        translationY = offset.y
                    },
            )
            when (state) {
                is AsyncImagePainter.State.Loading -> CircularProgressIndicator(
                    Modifier.align(Alignment.Center), color = Color.White,
                )
                is AsyncImagePainter.State.Error -> Text(
                    "Couldn't load this image.", color = Color.White, fontSize = 15.sp,
                    modifier = Modifier.align(Alignment.Center),
                )
                else -> {}
            }
            Row(
                Modifier.align(Alignment.TopEnd).statusBarsPadding().padding(8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                ViewerButton(Icons.Filled.Share, "Share") {
                    val send = Intent(Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(Intent.EXTRA_TEXT, attachment.url)
                    }
                    runCatching { context.startActivity(Intent.createChooser(send, null)) }
                }
                ViewerButton(Icons.Filled.OpenInBrowser, "Open in browser", onOpenExternally)
                ViewerButton(Icons.Filled.Close, "Close", onDismiss)
            }
        }
    }
}

@Composable
private fun ViewerButton(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, onClick: () -> Unit) {
    IconButton(onClick = onClick, modifier = Modifier.clip(CircleShape).background(Color.Black.copy(alpha = 0.5f))) {
        Icon(icon, contentDescription = label, tint = Color.White)
    }
}
