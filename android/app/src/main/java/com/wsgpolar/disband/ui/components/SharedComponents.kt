package com.wsgpolar.disband.ui.components

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wsgpolar.disband.core.Brand
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.core.Palette
import com.wsgpolar.disband.core.Radii
import com.wsgpolar.disband.core.color
import com.wsgpolar.disband.data.Profile
import com.wsgpolar.disband.data.UserStatus
import com.wsgpolar.disband.ui.AvatarImage

/**
 * Screen title block mirroring iOS ScreenHeader: large bold title with an
 * optional muted subtitle, sitting on the screen background (not a bar).
 */
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
            .background(palette.background)
            .padding(start = 20.dp, end = 16.dp, top = 8.dp, bottom = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(title, color = palette.textPrimary, fontSize = 22.sp, fontWeight = FontWeight.Bold)
            subtitle?.let {
                Spacer(Modifier.height(2.dp))
                Text(it, color = palette.textMuted, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        actions()
    }
}

/** Uppercase muted section label, matching iOS SectionCaption. */
@Composable
fun SectionCaption(label: String, modifier: Modifier = Modifier) {
    val palette = LocalPalette.current
    Text(
        label.uppercase(),
        color = palette.textMuted,
        fontSize = 12.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = 0.6.sp,
        modifier = modifier.padding(start = 24.dp, end = 24.dp, top = 14.dp, bottom = 6.dp),
    )
}

/** Rounded surface card grouping settings-style rows, iOS SettingsGroup. */
@Composable
fun SettingsGroup(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val palette = LocalPalette.current
    Column(
        modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .clip(RoundedCornerShape(Radii.card))
            .background(palette.surface)
            .border(1.dp, palette.divider.copy(alpha = 0.3f), RoundedCornerShape(Radii.card))
            .then(modifier),
    ) {
        content()
    }
}

@Composable
fun SettingsDivider(modifier: Modifier = Modifier) {
    val palette = LocalPalette.current
    HorizontalDivider(color = palette.divider.copy(alpha = 0.5f), thickness = 0.5.dp, modifier = modifier)
}

/**
 * Pill filter bar mirroring iOS CapsuleFilterBar: horizontally scrolling,
 * 36dp pills, active white-on-accent, inactive secondary-on-elevated.
 */
@Composable
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
        modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 20.dp)
            .then(modifier),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        options.forEach { option ->
            val isSelected = selected == option
            val badgeCount = badge(option)
            Box(
                modifier = Modifier
                    .heightIn(min = 36.dp)
                    .clip(CircleShape)
                    .background(
                        if (isSelected) palette.accent
                        else palette.surface
                    )
                    .border(
                        1.dp,
                        if (isSelected) Color.Transparent else palette.divider.copy(alpha = 0.4f),
                        CircleShape,
                    )
                    .clickable(role = Role.Tab, onClick = { onSelect(option) })
                    .padding(horizontal = 14.dp, vertical = 8.dp),
                contentAlignment = Alignment.Center,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        title(option),
                        color = if (isSelected) Color.White else palette.textSecondary,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                    if (badgeCount > 0) {
                        Spacer(Modifier.width(6.dp))
                        Box(
                            Modifier
                                .clip(CircleShape)
                                .background(
                                    if (isSelected) Color.White.copy(alpha = 0.25f)
                                    else Brand.dnd.copy(alpha = 0.15f)
                                )
                                .padding(horizontal = 6.dp, vertical = 1.dp),
                        ) {
                            Text(
                                if (badgeCount > 99) "99+" else "$badgeCount",
                                color = if (isSelected) Color.White else Brand.dnd,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                    }
                }
            }
        }
    }
}

/** Capsule search field with magnifier and clear button, iOS CapsuleSearchField. */
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
            .padding(horizontal = 20.dp)
            .heightIn(min = 42.dp),
        placeholder = { Text(prompt, color = palette.textMuted, fontSize = 15.sp) },
        leadingIcon = {
            Icon(Icons.Filled.Search, contentDescription = null, tint = palette.textMuted, modifier = Modifier.size(18.dp))
        },
        trailingIcon = {
            if (text.isNotEmpty()) {
                IconButton(onClick = { onValueChange("") }, modifier = Modifier.size(36.dp)) {
                    Icon(
                        Icons.Filled.Clear,
                        contentDescription = "Clear search",
                        tint = palette.textMuted,
                        modifier = Modifier.size(16.dp),
                    )
                }
            }
        },
        singleLine = true,
        shape = CircleShape,
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
            modifier
                .size(size)
                .clip(CircleShape)
                .background(palette.accent.copy(alpha = 0.15f)),
            contentAlignment = Alignment.Center,
        ) {
            Text("+", color = palette.accent, fontSize = 18.sp, fontWeight = FontWeight.Bold)
        }
    } else {
        val shown = profiles.take(maxVisible)
        Row(
            modifier = modifier,
            horizontalArrangement = Arrangement.spacedBy((-10).dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            shown.forEachIndexed { index, profile ->
                val tile = if (index == 0) size else size * 0.72f
                Box(
                    Modifier
                        .size(tile)
                        .clip(CircleShape)
                        .border(2.dp, palette.surface, CircleShape)
                        .background(palette.surface),
                    contentAlignment = Alignment.Center,
                ) {
                    AvatarImage(url = profile.avatarUrl, name = profile.name, size = tile)
                }
            }
            if (profiles.size > maxVisible) {
                Box(
                    Modifier
                        .size(size * 0.72f)
                        .clip(CircleShape)
                        .border(2.dp, palette.surface, CircleShape)
                        .background(palette.elevated),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        "+${profiles.size - maxVisible}",
                        color = palette.textSecondary,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }
    }
}

@Composable
fun FriendRow(
    profile: Profile?,
    status: UserStatus? = null,
    modifier: Modifier = Modifier,
    trailing: (@Composable () -> Unit)? = null,
) {
    val palette = LocalPalette.current
    Row(
        modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AvatarImage(
            url = profile?.avatarUrl,
            name = profile?.name ?: "?",
            size = 44.dp,
            presence = status?.color(palette),
        )
        Column(Modifier.padding(start = 12.dp).weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    profile?.name ?: "Unknown",
                    color = palette.textPrimary,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                profile?.pronouns?.takeIf { it.isNotBlank() }?.let {
                    Spacer(Modifier.width(6.dp))
                    Text(it, color = palette.textMuted, fontSize = 12.sp, maxLines = 1)
                }
            }
            val sub = profile?.activeStatusNote
                ?: profile?.handle?.let { "@$it" } ?: ""
            Text(sub, color = palette.textMuted, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        trailing?.invoke()
    }
}

@Composable
fun MessageComposer(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String = "Message",
    onSend: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val palette = LocalPalette.current
    Row(
        modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            placeholder = { Text(placeholder, color = palette.textMuted) },
            singleLine = true,
            shape = CircleShape,
            modifier = Modifier.weight(1f),
        )
        Spacer(Modifier.width(8.dp))
        IconButton(
            onClick = onSend,
            enabled = value.isNotBlank(),
            modifier = Modifier.size(48.dp),
        ) {
            Icon(
                Icons.AutoMirrored.Filled.Send,
                contentDescription = "Send",
                tint = if (value.isNotBlank()) palette.accent else palette.textMuted,
                modifier = Modifier.size(20.dp),
            )
        }
    }
}

@Composable
fun ReactionBar(
    reactions: List<ReactionInfo>,
    onAdd: () -> Unit,
    onToggle: (String) -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val palette = LocalPalette.current
    Row(
        modifier.fillMaxWidth().padding(horizontal = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        reactions.forEach { reaction ->
            Box(
                Modifier
                    .clip(CircleShape)
                    .background(
                        if (reaction.isPressed) palette.accent.copy(alpha = 0.2f)
                        else palette.elevated
                    )
                    .border(
                        1.dp,
                        if (reaction.isPressed) palette.accent else Color.Transparent,
                        CircleShape,
                    )
                    .clickable(role = Role.Button, onClick = { onToggle(reaction.emoji) })
                    .padding(horizontal = 8.dp, vertical = 4.dp),
            ) {
                Text(
                    "${reaction.emoji} ${reaction.count}",
                    color = if (reaction.isPressed) palette.accent else palette.textPrimary,
                    fontSize = 13.sp,
                )
            }
        }
        IconButton(onClick = onAdd, modifier = Modifier.size(40.dp)) {
            Icon(
                Icons.Filled.Add,
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

/** Presence dot that gently pulses while speaking. Respects the passed modifier. */
@Composable
fun SpeakingPulse(
    isSpeaking: Boolean,
    modifier: Modifier = Modifier,
) {
    val palette = LocalPalette.current
    val dotColor = if (isSpeaking) Brand.online else palette.textMuted
    if (!isSpeaking) {
        Box(modifier.size(10.dp).clip(CircleShape).background(dotColor))
        return
    }
    val transition = rememberInfiniteTransition(label = "speaking")
    val scale by transition.animateFloat(
        initialValue = 0.8f,
        targetValue = 1.25f,
        animationSpec = infiniteRepeatable(tween(700), RepeatMode.Reverse),
        label = "pulse",
    )
    Box(
        modifier
            .size(10.dp)
            .clip(CircleShape)
            .background(dotColor.copy(alpha = 0.35f * scale)),
        contentAlignment = Alignment.Center,
    ) {
        Box(Modifier.size(6.dp).clip(CircleShape).background(dotColor))
    }
}

/** Banner gradient fallback with initials, used behind profile/space headers. */
@Composable
fun BlurredAvatarBackdrop(
    avatarUrl: String?,
    name: String,
    modifier: Modifier = Modifier,
) {
    val palette = LocalPalette.current
    Box(
        modifier
            .clip(RoundedCornerShape(Radii.card))
            .background(Brush.horizontalGradient(listOf(palette.accent, palette.accentSoft))),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            name.trim().takeIf { it.isNotEmpty() }?.first()?.uppercase() ?: "?",
            color = Color.White.copy(alpha = 0.35f),
            fontSize = 64.sp,
            fontWeight = FontWeight.Bold,
        )
    }
}

/** Centered empty state with an optional action — every list gets one. */
@Composable
fun EmptyState(
    title: String,
    detail: String? = null,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    val palette = LocalPalette.current
    Column(
        modifier.fillMaxWidth().padding(top = 64.dp, start = 32.dp, end = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(title, color = palette.textPrimary, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
        detail?.let { Text(it, color = palette.textMuted, fontSize = 14.sp) }
        if (actionLabel != null && onAction != null) {
            Spacer(Modifier.height(8.dp))
            Box(
                Modifier
                    .clip(CircleShape)
                    .background(palette.accent)
                    .clickable(role = Role.Button, onClick = onAction)
                    .padding(horizontal = 18.dp, vertical = 10.dp),
            ) {
                Text(actionLabel, color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

/** Centered error with retry — failures must never masquerade as empty. */
@Composable
fun ErrorState(
    message: String,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val palette = LocalPalette.current
    Column(
        modifier.fillMaxWidth().padding(top = 64.dp, start = 32.dp, end = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text("Couldn't load", color = palette.textPrimary, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
        Text(message, color = palette.textMuted, fontSize = 13.sp)
        Box(
            Modifier
                .clip(CircleShape)
                .border(1.dp, palette.divider, CircleShape)
                .clickable(role = Role.Button, onClick = onRetry)
                .padding(horizontal = 18.dp, vertical = 10.dp),
        ) {
            Text("Try again", color = palette.textPrimary, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
        }
    }
}

/** Inline loading row for lists that already have content. */
@Composable
fun LoadingRow(modifier: Modifier = Modifier) {
    val palette = LocalPalette.current
    Box(modifier.fillMaxWidth().padding(20.dp), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = palette.accent, modifier = Modifier.size(22.dp))
    }
}
