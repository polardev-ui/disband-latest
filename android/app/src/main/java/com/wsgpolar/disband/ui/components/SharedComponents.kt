package com.wsgpolar.disband.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wsgpolar.disband.core.Brand
import com.wsgpolar.disband.core.color
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.core.Palette
import com.wsgpolar.disband.data.Profile
import com.wsgpolar.disband.data.UserStatus
import com.wsgpolar.disband.ui.AvatarImage

@Composable
fun ScreenHeader(
    title: String,
    subtitle: String? = null,
    actions: @Composable RowScope.() -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val palette = LocalPalette.current
    Row(
        modifier
            .fillMaxWidth()
            .background(palette.surface)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(title, color = palette.textPrimary, fontSize = 22.sp, fontWeight = FontWeight.Bold)
            subtitle?.let {
                Text(it, color = palette.textMuted, fontSize = 13.sp)
            }
        }
        actions()
    }
}

@Composable
fun SectionCaption(label: String, modifier: Modifier = Modifier) {
    val palette = LocalPalette.current
    Text(
        label, color = palette.textMuted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
        modifier = modifier.padding(start = 16.dp, top = 14.dp, bottom = 6.dp),
    )
}

@Composable
fun SettingsGroup(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val palette = LocalPalette.current
    Column(
        modifier
            .fillMaxWidth()
            .background(palette.surfaceRaised)
            .then(modifier),
    ) {
        content()
    }
}

@Composable
fun SettingsDivider(modifier: Modifier = Modifier) {
    val palette = LocalPalette.current
    HorizontalDivider(color = palette.divider, thickness = 0.5.dp, modifier = modifier)
}

@Composable
// Generic over the caller's own filter type, and taking the selection by value.
// Handing a State<T> out to callers invited exactly one bug: FriendsScreen made
// a second, disconnected mutableStateOf, so tapping a chip moved the bar's idea
// of the selection but never the screen's.
fun <T> CapsuleFilterBar(
    options: List<T>,
    selected: T,
    onSelect: (T) -> Unit,
    title: (T) -> String,
    badge: (T) -> Int = { 0 },
    modifier: Modifier = Modifier,
) {
    val palette = LocalPalette.current
    Row(
        modifier.fillMaxWidth().padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        options.forEach { option ->
            val isSelected = selected == option
            val badgeCount = badge(option)
            androidx.compose.material3.FilterChip(
                selected = isSelected,
                onClick = { onSelect(option) },
                label = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(title(option), color = if (isSelected) Color.White else palette.textSecondary, fontSize = 13.sp)
                        if (badgeCount > 0) {
                            Spacer(Modifier.width(6.dp))
                            Text("$badgeCount", color = if (isSelected) Color.White else Brand.dnd,
                                fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                },
                modifier = Modifier.height(32.dp),
            )
        }
    }
}

@Composable
fun CapsuleSearchField(
    text: String,
    onValueChange: (String) -> Unit,
    prompt: String = "Search",
    modifier: Modifier = Modifier,
) {
    val palette = LocalPalette.current
    OutlinedTextField(
        value = text,
        onValueChange = onValueChange,
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        placeholder = { Text(prompt, color = palette.textMuted) },
        singleLine = true,
    )
}

@Composable
fun AvatarCluster(
    profiles: List<Profile>,
    size: androidx.compose.ui.unit.Dp = 44.dp,
    maxVisible: Int = 4,
    modifier: Modifier = Modifier,
) {
    val palette = LocalPalette.current
    if (profiles.isEmpty()) {
        Box(
            Modifier.size(size * 1.5f).clip(CircleShape).background(palette.accent.copy(alpha = 0.15f)),
            contentAlignment = Alignment.Center,
        ) {
            Text("+", color = palette.accent, fontSize = 18.sp, fontWeight = FontWeight.Bold)
        }
    } else {
        val shown = profiles.take(maxVisible)
        Box(Modifier.size(size * 1.5f)) {
            shown.forEachIndexed { index, profile ->
                val offsetX = when (index) {
                    0 -> 0f
                    1 -> -18f
                    2 -> -14f
                    3 -> -16f
                    else -> 0f
                }
                val offsetY = when (index) {
                    0 -> 0f
                    1 -> -6f
                    2 -> -12f
                    3 -> -12f
                    else -> 0f
                }
                Box(
                    Modifier
                        .offset(offsetX.dp, offsetY.dp)
                        .size(if (index == 0) size else size * 0.72f),
                ) {
                    AvatarImage(url = profile.avatarUrl, name = profile.name, size = size)
                }
            }
        }
    }
}

@Composable
fun FriendRow(
    profile: Profile?,
    status: com.wsgpolar.disband.data.UserStatus? = null,
    modifier: Modifier = Modifier,
    trailing: (@Composable () -> Unit)? = null,
) {
    val palette = LocalPalette.current
    Row(
        modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        com.wsgpolar.disband.ui.AvatarImage(
            url = profile?.avatarUrl,
            name = profile?.name ?: "?",
            size = 44.dp,
            presence = status?.color(palette),
        )
        Column(Modifier.padding(start = 10.dp).weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(profile?.name ?: "Unknown", color = palette.textPrimary,
                    fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            }
            Text(profile?.handle?.let { "@$it" } ?: "", color = palette.textMuted, fontSize = 13.sp)
        }
        trailing?.invoke()
    }
}

@Composable
fun MessageComposer(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String = "Message #channel",
    onSend: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val palette = LocalPalette.current
    Row(
        modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        androidx.compose.material3.OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            placeholder = { Text(placeholder, color = palette.textMuted) },
            singleLine = true,
            modifier = Modifier.weight(1f),
        )
        Spacer(Modifier.width(8.dp))
        androidx.compose.material3.IconButton(onClick = onSend, modifier = Modifier.size(40.dp)) {
            androidx.compose.material3.Icon(
                Icons.AutoMirrored.Filled.Send,
                contentDescription = "Send",
                tint = palette.accent,
                modifier = Modifier.size(20.dp),
            )
        }
    }
}

@Composable
fun ReactionBar(
    reactions: List<ReactionInfo>,
    onAdd: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val palette = LocalPalette.current
    Row(
        modifier.fillMaxWidth().padding(horizontal = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        reactions.forEach { reaction ->
            Box(
                Modifier.background(palette.elevated, CircleShape).padding(horizontal = 8.dp, vertical = 4.dp),
            ) {
                Text("${reaction.emoji} ${reaction.count}", color = palette.textPrimary, fontSize = 13.sp)
            }
        }
        androidx.compose.material3.IconButton(onClick = onAdd, modifier = Modifier.size(32.dp)) {
            androidx.compose.material3.Icon(
                androidx.compose.material.icons.Icons.Filled.Add,
                contentDescription = "Add reaction",
                tint = palette.textMuted,
                modifier = Modifier.size(18.dp),
            )
        }
    }
}

data class ReactionInfo(
    val emoji: String,
    val count: Int,
    val isPressed: Boolean = false,
)

@Composable
fun SpeakingPulse(
    isSpeaking: Boolean,
    modifier: Modifier = Modifier,
) {
    val palette = LocalPalette.current
    val dotColor = if (isSpeaking) Brand.online else palette.textMuted
    Box(
        Modifier
            .size(10.dp)
            .clip(CircleShape)
            .background(dotColor),
    )
}

@Composable
fun BlurredAvatarBackdrop(
    avatarUrl: String?,
    name: String,
    modifier: Modifier = Modifier,
) {
    val palette = LocalPalette.current
    Box(
        Modifier
            .size(200.dp)
            .clip(CircleShape)
            .background(palette.background.copy(alpha = 0.7f)),
    )
}
