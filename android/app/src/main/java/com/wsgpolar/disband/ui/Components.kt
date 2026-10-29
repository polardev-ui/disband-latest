package com.wsgpolar.disband.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.wsgpolar.disband.core.AppConfig
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.core.seeded

/** Round avatar with a stable seeded fallback colour, mirroring the iOS AvatarView. */
@Composable
fun AvatarImage(
    url: String?,
    name: String,
    size: Dp = 40.dp,
    modifier: Modifier = Modifier,
    presence: Color? = null,
    /** Cut-out around the presence dot; match whatever the avatar sits on. */
    ring: Color = LocalPalette.current.background,
    /** Offline reads as a hollow ring rather than a solid grey dot. */
    hollow: Boolean = false,
    /** An equipped avatar decoration (shop item id); see [AvatarDecoration]. */
    decoration: String? = null,
) {
    Box(modifier, contentAlignment = Alignment.Center) {
        if (url.isNullOrBlank()) {
            Box(
                Modifier.size(size).clip(CircleShape).background(Color.seeded(name)),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    name.firstOrNull()?.uppercase() ?: "?",
                    color = Color.White,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = (size.value * 0.4f).sp,
                )
            }
        } else {
            AsyncImage(
                model = url,
                contentDescription = name,
                contentScale = ContentScale.Crop,
                modifier = Modifier.size(size).clip(CircleShape),
            )
        }
        AvatarDecoration(decoration, avatarSize = size)
        if (presence != null) {
            Box(
                Modifier
                    .align(Alignment.BottomEnd)
                    .size((size.value * 0.34f).dp)
                    .clip(CircleShape)
                    .background(ring)
                    .padding((size.value * 0.06f).coerceAtLeast(2f).dp),
            ) {
                Box(
                    Modifier
                        .fillMaxSize()
                        .clip(CircleShape)
                        .background(presence),
                ) {
                    if (hollow) {
                        Box(
                            Modifier
                                .fillMaxSize()
                                .padding((size.value * 0.055f).coerceAtLeast(2f).dp)
                                .clip(CircleShape)
                                .background(ring),
                        )
                    }
                }
            }
        }
    }
}

/**
 * An avatar decoration, drawn from the art the web exports to
 * /decorations/<item>.png. That art is twice the photo's size and centred on
 * it, so it reaches past the photo on every side as it does on desktop. It is
 * drawn unbounded: place it centred on the photo, outside any clip.
 */
@Composable
fun AvatarDecoration(itemId: String?, avatarSize: Dp, modifier: Modifier = Modifier) {
    if (itemId.isNullOrBlank()) return
    AsyncImage(
        model = "${AppConfig.WEB_APP_URL}/decorations/$itemId.png",
        contentDescription = null,
        contentScale = ContentScale.Fit,
        modifier = modifier
            .wrapContentSize(unbounded = true)
            .requiredSize(avatarSize * 2),
    )
}
