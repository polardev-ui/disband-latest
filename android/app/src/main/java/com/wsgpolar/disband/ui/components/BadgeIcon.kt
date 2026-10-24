package com.wsgpolar.disband.ui.components

import android.annotation.SuppressLint
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * One badge emblem: the same artwork the web and desktop draw, generated from
 * src/components/ui/BadgeArt.tsx by scripts/generate-badge-art.mjs into
 * res/drawable/badge_<key>.xml. Draws nothing for a badge newer than the build.
 */
@SuppressLint("DiscouragedApi")
@Composable
fun BadgeIcon(key: String, size: Dp = 20.dp, contentDescription: String? = null, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val id = remember(key) { context.resources.getIdentifier("badge_$key", "drawable", context.packageName) }
    if (id == 0) return
    Image(painterResource(id), contentDescription = contentDescription, modifier = modifier.size(size))
}
