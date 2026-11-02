package com.wsgpolar.disband.ui.components

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.SportsEsports
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.data.Listening
import com.wsgpolar.disband.data.ProfileActivity
import com.wsgpolar.disband.data.TimeParse
import kotlinx.coroutines.delay
import java.time.Instant

/**
 * Only plain https links are drawn or opened, like the web's `safeImageUrl`:
 * Rich Presence sends asset keys and other schemes too.
 */
private fun safeUrl(raw: String?): String? {
    val uri = raw?.let { runCatching { Uri.parse(it) }.getOrNull() } ?: return null
    return raw.takeIf { uri.scheme == "https" && !uri.host.isNullOrBlank() }
}

/** The current time, ticking once a second while shown. */
@Composable
private fun rememberNow(): Instant {
    var now by remember { mutableStateOf(Instant.now()) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(1_000)
            now = Instant.now()
        }
    }
    return now
}

private fun clock(seconds: Long): String {
    val h = seconds / 3600
    val m = (seconds % 3600) / 60
    val s = seconds % 60
    return if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%d:%02d".format(m, s)
}

/**
 * "Listening to Spotify": artwork, track, artist and a progress bar, as on the
 * web's `ListeningCard`. Opens the track in Spotify when tapped.
 */
@Composable
fun ListeningCard(listening: Listening, modifier: Modifier = Modifier) {
    val palette = LocalPalette.current
    val context = LocalContext.current
    val now = rememberNow()
    val trackUrl = safeUrl(listening.trackUrl)

    Column(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(palette.elevated.copy(alpha = 0.5f))
            .clickable(enabled = trackUrl != null) {
                runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(trackUrl))) }
            }
            .padding(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.MusicNote, contentDescription = null, tint = Color(0xFF1DB954), modifier = Modifier.size(14.dp))
            Spacer(Modifier.width(6.dp))
            Text(
                if (listening.source == "spotify") "Listening to Spotify" else "Listening to music",
                color = palette.textMuted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
            )
        }
        Spacer(Modifier.height(10.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(64.dp).clip(RoundedCornerShape(10.dp)).background(palette.elevated),
                contentAlignment = Alignment.Center,
            ) {
                val art = safeUrl(listening.artwork)
                if (art != null) {
                    AsyncImage(model = art, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                } else {
                    Icon(Icons.Filled.MusicNote, contentDescription = null, tint = palette.textMuted)
                }
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(listening.track ?: "", color = palette.textPrimary, fontSize = 15.sp, fontWeight = FontWeight.SemiBold,
                    maxLines = 1, overflow = TextOverflow.Ellipsis)
                listening.artists?.takeIf { it.isNotBlank() }?.let {
                    Text("by $it", color = palette.textSecondary, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                listening.album?.takeIf { it.isNotBlank() }?.let {
                    Text("on $it", color = palette.textMuted, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
        val started = listening.startedInstant
        val totalMs = listening.durationMs?.takeIf { it > 0 }
        if (started != null && totalMs != null) {
            val total = (totalMs / 1000).toLong()
            val elapsed = ((now.toEpochMilli() - started.toEpochMilli()) / 1000).coerceIn(0, total)
            Spacer(Modifier.height(10.dp))
            LinearProgressIndicator(
                progress = { if (total > 0) elapsed.toFloat() / total else 0f },
                modifier = Modifier.fillMaxWidth().height(4.dp).clip(CircleShape),
                color = palette.textPrimary,
                trackColor = palette.elevated,
                drawStopIndicator = {},
            )
            Spacer(Modifier.height(4.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(clock(elapsed), color = palette.textMuted, fontSize = 11.sp)
                Text(clock(total), color = palette.textMuted, fontSize = 11.sp)
            }
        }
    }
}

/**
 * A game in progress, like the web's `ActivityCard`: the game's art large, its
 * own logo as a small badge, the Rich Presence lines, a running clock, and
 * any buttons the game offers.
 */
@Composable
fun GameActivityCard(activity: ProfileActivity, modifier: Modifier = Modifier) {
    val palette = LocalPalette.current
    val context = LocalContext.current
    val now = rememberNow()

    Column(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(palette.elevated.copy(alpha = 0.5f))
            .padding(14.dp),
    ) {
        Text(activity.verb, color = palette.textMuted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(10.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box {
                Box(
                    Modifier.size(72.dp).clip(RoundedCornerShape(10.dp)).background(palette.elevated),
                    contentAlignment = Alignment.Center,
                ) {
                    val large = safeUrl(activity.largeImage)
                    if (large != null) {
                        AsyncImage(model = large, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                    } else {
                        Icon(Icons.Filled.SportsEsports, contentDescription = null, tint = palette.textMuted, modifier = Modifier.size(28.dp))
                    }
                }
                safeUrl(activity.smallImage)?.let { small ->
                    AsyncImage(
                        model = small, contentDescription = null, contentScale = ContentScale.Crop,
                        modifier = Modifier.align(Alignment.BottomEnd).offset(x = 6.dp, y = 6.dp).size(24.dp)
                            .clip(CircleShape).border(3.dp, palette.surface, CircleShape),
                    )
                }
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(activity.name ?: "", color = palette.textPrimary, fontSize = 15.sp, fontWeight = FontWeight.SemiBold,
                    maxLines = 1, overflow = TextOverflow.Ellipsis)
                activity.details?.takeIf { it.isNotBlank() }?.let {
                    Text(it, color = palette.textSecondary, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                activity.state?.takeIf { it.isNotBlank() }?.let {
                    Text(it, color = palette.textSecondary, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                gameClock(activity, now)?.let {
                    Text(it, color = Color(0xFF3BA55C), fontSize = 13.sp)
                }
            }
        }
        val buttons = activity.buttons.orEmpty().mapNotNull { b ->
            val label = b.label?.takeIf { it.isNotBlank() } ?: return@mapNotNull null
            val url = safeUrl(b.url) ?: return@mapNotNull null
            label to url
        }.take(2)
        if (buttons.isNotEmpty()) {
            Spacer(Modifier.height(10.dp))
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                buttons.forEach { (label, url) ->
                    Box(
                        Modifier.fillMaxWidth().height(36.dp).clip(RoundedCornerShape(8.dp)).background(palette.elevated)
                            .clickable { runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } },
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(label, color = palette.textPrimary, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
    }
}

/** "1:04 left" for a countdown, otherwise "12:04 elapsed". */
private fun gameClock(activity: ProfileActivity, now: Instant): String? {
    activity.endsAt?.let { TimeParse.instant(it) }?.takeIf { it.isAfter(now) }?.let { ends ->
        val left = (ends.toEpochMilli() - now.toEpochMilli() + 999) / 1000
        return "${clock(left)} left"
    }
    val started = activity.startedAt?.let { TimeParse.instant(it) } ?: return null
    return "${clock(((now.toEpochMilli() - started.toEpochMilli()) / 1000).coerceAtLeast(0))} elapsed"
}

/** Both cards for a profile, whichever are live. */
@Composable
fun ProfileActivityCards(listening: Listening?, activity: ProfileActivity?, modifier: Modifier = Modifier) {
    val now = rememberNow()
    val game = activity?.takeIf { it.isLive(now) }
    val song = listening?.takeIf { it.isCurrent(now) }
    if (game == null && song == null) return
    Column(modifier, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        game?.let { GameActivityCard(it) }
        song?.let { ListeningCard(it) }
    }
}
