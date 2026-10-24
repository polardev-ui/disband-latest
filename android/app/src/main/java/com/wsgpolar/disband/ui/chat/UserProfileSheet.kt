package com.wsgpolar.disband.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.core.TimeFormat
import com.wsgpolar.disband.core.seeded
import com.wsgpolar.disband.data.Database
import com.wsgpolar.disband.data.Profile
import com.wsgpolar.disband.ui.AvatarImage

/**
 * Someone's profile, opened by tapping their avatar or name in a chat.
 * Android had no way to look at anyone but yourself; avatars were inert.
 * The row's embedded profile shows at once, then a fresh read fills in
 * anything the realtime payload left out.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun UserProfileSheet(initial: Profile, onDismiss: () -> Unit) {
    val palette = LocalPalette.current
    var profile by remember(initial.id) { mutableStateOf(initial) }
    LaunchedEffect(initial.id) {
        runCatching { Database.profile(initial.id) }.getOrNull()?.let { profile = it }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = palette.surface,
        dragHandle = null,
    ) {
        Column(Modifier.navigationBarsPadding().padding(bottom = 24.dp)) {
            Box(Modifier.fillMaxWidth().height(120.dp)) {
                val banner = profile.bannerUrl
                if (!banner.isNullOrBlank()) {
                    AsyncImage(model = banner, contentDescription = null, contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize())
                } else {
                    val accent = profile.accentColor?.let { runCatching { Color(android.graphics.Color.parseColor(it)) }.getOrNull() }
                    Box(Modifier.fillMaxSize().background(
                        accent?.let { Brush.linearGradient(listOf(it, it.copy(alpha = 0.6f))) }
                            ?: Brush.linearGradient(listOf(Color.seeded(profile.id), Color.seeded(profile.id + "·"))),
                    ))
                }
            }
            Box(Modifier.padding(start = 16.dp).offset(y = (-44).dp)) {
                Box(Modifier.clip(CircleShape).background(palette.surface).padding(5.dp)) {
                    AvatarImage(url = profile.avatarUrl, name = profile.name, size = 84.dp)
                }
            }
            Column(Modifier.offset(y = (-34).dp).padding(horizontal = 20.dp)) {
                Text(profile.name, color = palette.textPrimary, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                val sub = listOfNotNull("@${profile.handle}", profile.pronouns?.takeIf { it.isNotBlank() }).joinToString(" · ")
                Text(sub, color = palette.textMuted, fontSize = 14.sp)

                profile.activeStatusNote?.let {
                    Spacer(Modifier.height(12.dp))
                    Text(
                        it,
                        color = palette.textSecondary,
                        fontSize = 14.sp,
                        modifier = Modifier.clip(RoundedCornerShape(12.dp)).background(palette.elevated)
                            .padding(horizontal = 12.dp, vertical = 8.dp),
                    )
                }

                profile.bio?.takeIf { it.isNotBlank() }?.let {
                    Spacer(Modifier.height(16.dp))
                    Text("ABOUT ME", color = palette.textMuted, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(4.dp))
                    Text(it, color = palette.textPrimary, fontSize = 15.sp)
                }

                profile.createdAt?.let { joined ->
                    Spacer(Modifier.height(16.dp))
                    Text("MEMBER SINCE", color = palette.textMuted, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(4.dp))
                    Text(TimeFormat.short(joined), color = palette.textPrimary, fontSize = 15.sp)
                }
            }
        }
    }
}
