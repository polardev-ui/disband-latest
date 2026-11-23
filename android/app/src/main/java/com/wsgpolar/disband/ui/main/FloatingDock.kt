package com.wsgpolar.disband.ui.main

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandHorizontally
import androidx.compose.animation.shrinkHorizontally
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.semantics.Role
import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.Notes
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wsgpolar.disband.core.Brand
import com.wsgpolar.disband.core.LocalPalette

private val DOCK_HEIGHT = 58.dp
private val DOCK_ITEM = 46.dp

/**
 * The floating glass capsule dock, mirroring iOS FloatingDock. It is not
 * edge-attached: the shell gives it a small bottom inset, and lists carry a
 * matching bottom margin. The glass is a translucent surface (55%) over a
 * hairline white border with a large soft shadow — Compose cannot blur what
 * sits behind a composable, so translucency degrades gracefully instead.
 */
@Composable
fun FloatingDock(
    state: ShellChromeState,
    onDestinationSelected: (Destination) -> Unit,
    modifier: Modifier = Modifier,
    homeBadge: Int = 0,
) {
    val palette = LocalPalette.current

    Row(
        modifier = modifier.fillMaxWidth().padding(horizontal = 18.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(DOCK_HEIGHT)
                .shadow(
                    elevation = 18.dp,
                    shape = CircleShape,
                    ambientColor = Color.Black.copy(alpha = 0.40f),
                    spotColor = Color.Black.copy(alpha = 0.40f),
                )
                .clip(CircleShape)
                .background(palette.surface)
                .background(palette.elevated.copy(alpha = 0.55f))
                .border(
                    1.dp,
                    Brush.verticalGradient(listOf(Color.White.copy(alpha = 0.14f), Color.White.copy(alpha = 0.03f))),
                    CircleShape,
                )
                .padding(6.dp).selectableGroup(),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Destination.entries.forEach { destination ->
                val isSelected = state.currentDestination == destination
                val iconColor by animateColorAsState(
                    targetValue = if (isSelected) Color.White else palette.textMuted,
                    label = "dockIcon_$destination",
                )

                DockItem(
                    destination = destination,
                    icon = destination.icon(),
                    label = destination.label,
                    isSelected = isSelected,
                    iconColor = iconColor,
                    badge = if (destination == Destination.Home) homeBadge else 0,
                    onSelected = { onDestinationSelected(destination) },
                    modifier = if (isSelected) Modifier else Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
private fun DockItem(
    destination: Destination,
    icon: ImageVector,
    label: String,
    isSelected: Boolean,
    iconColor: Color,
    badge: Int = 0,
    onSelected: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val palette = LocalPalette.current
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()

    val haptic = LocalHapticFeedback.current
    val scale by animateFloatAsState(if (pressed) 0.94f else 1f,
        animationSpec = spring(stiffness = 550f), label = "dockPress")
    val fillAlpha by animateFloatAsState(if (isSelected) 1f else 0f,
        animationSpec = tween(180), label = "dockSelection")

    Box(modifier = modifier) {
        Row(
            modifier = Modifier
                .then(if (isSelected) Modifier else Modifier.fillMaxWidth())
                .height(DOCK_ITEM)
                .graphicsLayer { scaleX = scale; scaleY = scale }
                .clip(CircleShape)
                .background(
                    Brush.linearGradient(
                        listOf(palette.accent.copy(alpha = fillAlpha), palette.accentSoft.copy(alpha = fillAlpha)),
                    ),
                )
                .border(1.dp, Color.White.copy(alpha = 0.18f * fillAlpha), CircleShape)
                .selectable(
                    selected = isSelected, role = Role.Tab,
                    interactionSource = interaction, indication = null,
                    onClick = {
                        if (!isSelected) {
                            haptic.performHapticFeedback(HapticFeedbackType.SegmentTick)
                            onSelected()
                        }
                    },
                )
                .padding(horizontal = if (isSelected) 16.dp else 0.dp),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(icon, contentDescription = label, tint = iconColor,
                modifier = Modifier.size(if (isSelected) 22.dp else 21.dp))
            AnimatedVisibility(
                visible = isSelected,
                enter = expandHorizontally(spring(stiffness = 500f), expandFrom = Alignment.Start) + fadeIn(tween(160)),
                exit = shrinkHorizontally(spring(stiffness = 500f), shrinkTowards = Alignment.Start) + fadeOut(tween(100)),
            ) {
                Text(label, modifier = Modifier.padding(start = 7.dp), color = Color.White,
                    fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 1)
            }
        }

        if (badge > 0) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .offset(x = 4.dp, y = (-2).dp)
                    .clip(CircleShape)
                    .background(Brand.dnd)
                    .border(2.dp, palette.surface, CircleShape)
                    // Sized from the text so large font settings can't clip the count.
                    .defaultMinSize(minWidth = 17.dp, minHeight = 17.dp)
                    .padding(horizontal = 4.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    if (badge > 99) "99+" else "$badge",
                    color = Color.White,
                    fontSize = 10.sp,
                    lineHeight = 12.sp,
                    fontWeight = FontWeight.ExtraBold,
                )
            }
        }
    }
}

private fun Destination.icon(): ImageVector {
    return when (this) {
        Destination.Home -> Icons.AutoMirrored.Filled.Chat
        Destination.Friends -> Icons.Filled.People
        Destination.Notes -> Icons.Filled.Notes
        Destination.You -> Icons.Filled.Person
    }
}

private val Destination.label: String
    get() = when (this) {
        Destination.Home -> "Home"
        Destination.Friends -> "Friends"
        Destination.Notes -> "Notes"
        Destination.You -> "You"
    }
