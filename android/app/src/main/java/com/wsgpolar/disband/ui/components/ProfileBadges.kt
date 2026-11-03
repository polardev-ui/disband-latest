package com.wsgpolar.disband.ui.components

import android.annotation.SuppressLint
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.data.AwardedBadge
import com.wsgpolar.disband.data.BadgeService

/** One catalogue and cache for every profile the app opens. */
val SharedBadges = BadgeService()

/**
 * The badges someone holds, drawn with the same artwork as the web and
 * desktop. Profiles opened from chat showed none at all, so staff, owners
 * and early supporters looked like anyone else on a phone.
 *
 * Tap a badge for its name and what it's for. A badge newer than this build
 * has no artwork yet, so it shows as a coloured pill with its name instead.
 */
@SuppressLint("DiscouragedApi")
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ProfileBadges(userId: String, modifier: Modifier = Modifier) {
    val palette = LocalPalette.current
    val context = LocalContext.current
    var badges by remember(userId) { mutableStateOf<List<AwardedBadge>>(emptyList()) }
    var selected by remember(userId) { mutableStateOf<AwardedBadge?>(null) }
    LaunchedEffect(userId) {
        badges = runCatching { SharedBadges.badgesFor(userId) }.getOrDefault(emptyList())
    }
    Column(modifier) {
        // The guild tag leads the same wrapping row as the badges, as on the
        // web. It used to sit on a line of its own above a grey strip of
        // badges that scrolled sideways, which read as two unrelated things.
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
            itemVerticalAlignment = Alignment.CenterVertically,
        ) {
            GuildTagView(userId = userId, size = GuildTagBadgeSize.Medium)
            badges.forEach { badge ->
                val tint = runCatching { Color(android.graphics.Color.parseColor(badge.def.accent)) }.getOrDefault(palette.accent)
                val hasArt = remember(badge.def.key) {
                    context.resources.getIdentifier("badge_${badge.def.key}", "drawable", context.packageName) != 0
                }
                val tap = Modifier.clickable { selected = if (selected == badge) null else badge }
                if (hasArt) {
                    BadgeIcon(badge.def.key, size = 22.dp, contentDescription = badge.def.name, modifier = tap.padding(1.dp))
                } else {
                    Box(
                        tap
                            .clip(CircleShape)
                            .background(tint.copy(alpha = 0.18f))
                            .border(1.dp, tint.copy(alpha = 0.45f), CircleShape)
                            .padding(horizontal = 8.dp, vertical = 3.dp),
                    ) {
                        Text(badge.def.name, color = tint, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
        selected?.let { badge ->
            Column(
                Modifier
                    .padding(top = 6.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(palette.elevated)
                    .padding(horizontal = 10.dp, vertical = 6.dp),
            ) {
                Text(badge.def.name, color = palette.textPrimary, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                if (badge.def.description.isNotBlank()) {
                    Text(badge.def.description, color = palette.textMuted, fontSize = 12.sp)
                }
            }
        }
    }
}
