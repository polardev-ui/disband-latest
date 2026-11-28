package com.wsgpolar.disband.ui.main

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.data.StreakService

/** The streak on the You tab: the flame, this week's days and the next goal (iOS `DailyStreakCard`). */
@Composable
fun DailyStreakCard(modifier: Modifier = Modifier) {
    val palette = LocalPalette.current
    val streak by StreakService.state.collectAsState()
    var celebrate by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(if (celebrate) 1.25f else 1f, label = "streakFlame")
    LaunchedEffect(streak.milestone) {
        if (streak.milestone != null) {
            StreakService.celebrated()
            celebrate = true
            kotlinx.coroutines.delay(600)
            celebrate = false
        }
    }
    Row(
        modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(palette.surface)
            .border(1.dp, Color.White.copy(alpha = 0.06f), RoundedCornerShape(20.dp))
            .padding(16.dp)
            .semantics(mergeDescendants = true) { contentDescription = "${streak.current} day streak. Best ${streak.best}." },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(52.dp).clip(CircleShape)
                .background(Brush.verticalGradient(listOf(Color(0xFFFF9F43), Color(0xFFF0436E)))),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Filled.LocalFireDepartment, contentDescription = null, tint = Color.White,
                modifier = Modifier.size(26.dp).scale(scale))
        }
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.Bottom) {
                Text("${streak.current}", color = palette.textPrimary, fontSize = 22.sp, fontWeight = FontWeight.ExtraBold)
                Spacer(Modifier.width(6.dp))
                Text("day streak", color = palette.textSecondary, fontSize = 15.sp, fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f))
                Text("Next: ${streak.nextMilestone}", color = palette.textMuted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                for ((label, visited, today) in StreakService.week(streak)) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Box(
                            Modifier.size(20.dp).clip(CircleShape)
                                .background(if (visited) Color(0xFFFF7A45) else palette.elevated)
                                .border(1.5.dp, if (today) palette.textPrimary.copy(alpha = 0.6f) else Color.Transparent, CircleShape),
                            contentAlignment = Alignment.Center,
                        ) {
                            if (visited) Icon(Icons.Filled.Check, contentDescription = null, tint = Color.White, modifier = Modifier.size(11.dp))
                        }
                        Spacer(Modifier.size(4.dp))
                        Text(label, color = palette.textMuted, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
    }
}
