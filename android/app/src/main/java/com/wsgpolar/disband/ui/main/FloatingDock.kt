package com.wsgpolar.disband.ui.main

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

private val DOCK_HEIGHT = 64.dp
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
        modifier = modifier.fillMaxWidth().padding(horizontal = 20.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            modifier = Modifier
                .height(DOCK_HEIGHT)
                .shadow(
                    elevation = 18.dp,
                    shape = CircleShape,
                    ambientColor = Color.Black.copy(alpha = 0.40f),
                    spotColor = Color.Black.copy(alpha = 0.40f),
                )
                .clip(CircleShape)
                .background(palette.surface.copy(alpha = 0.55f))
                .border(1.dp, Color.White.copy(alpha = 0.08f), CircleShape)
                .padding(horizontal = 8.dp),
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
) {
    val palette = LocalPalette.current
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()

    Box {
        if (isSelected) {
            // Active item: an accent-gradient capsule carrying icon + label.
            Row(
                modifier = Modifier
                    .height(DOCK_ITEM)
                    .clip(CircleShape)
                    .background(
                        Brush.horizontalGradient(listOf(palette.accent, palette.accentSoft)),
                    )
                    .clickable(
                        interactionSource = interaction,
                        indication = null,
                        onClickLabel = label,
                        onClick = onSelected,
                    )
                    .padding(horizontal = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(7.dp),
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = label,
                    tint = iconColor,
                    modifier = Modifier.size(20.dp),
                )
                Text(
                    label,
                    color = Color.White,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        } else {
            Box(
                modifier = Modifier
                    .size(DOCK_ITEM)
                    .clip(CircleShape)
                    .clickable(
                        interactionSource = interaction,
                        indication = null,
                        onClickLabel = label,
                        onClick = onSelected,
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = label,
                    tint = iconColor,
                    modifier = Modifier.size(22.dp),
                )
            }
        }

        if (badge > 0) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .offset(x = 2.dp, y = (-2).dp)
                    .clip(CircleShape)
                    .background(Brand.danger)
                    .border(2.dp, palette.surface.copy(alpha = 0.55f), CircleShape)
                    .padding(horizontal = 4.dp)
                    .height(13.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    if (badge > 99) "99+" else "$badge",
                    color = Color.White,
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Bold,
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
