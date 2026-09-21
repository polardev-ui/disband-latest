package com.wsgpolar.disband.ui.main

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.foundation.layout.RowScope
import androidx.compose.material.icons.filled.Home
import androidx.compose.foundation.layout.size
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wsgpolar.disband.core.Brand
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.core.Palette
import com.wsgpolar.disband.core.Themes
import com.wsgpolar.disband.data.Server
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Notes
import androidx.compose.material.icons.filled.Person

@Composable
fun FloatingDock(
    state: ShellChromeState,
    onDestinationSelected: (Destination) -> Unit,
    modifier: Modifier = Modifier,
) {
    val palette = LocalPalette.current
    val dockWidth = 360.dp
    val dockHeight = 64.dp

    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            modifier = Modifier
                .height(dockHeight)
                .background(
                    color = if (palette.isDark) Color(0x1AFFFFFF) else Color(0x1A000000),
                    shape = androidx.compose.foundation.shape.CircleShape
                )
                .padding(horizontal = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Destination.entries.forEach { destination ->
                val isSelected = state.currentDestination == destination
                val iconColor by animateColorAsState(
                    targetValue = if (isSelected) palette.accent else palette.textMuted,
                    label = "dockIcon_$destination",
                )

                DockItem(
                    destination = destination,
                    icon = destination.icon(),
                    label = destination.label,
                    isSelected = isSelected,
                    iconColor = iconColor,
                    onSelected = { onDestinationSelected(destination) }
                )
            }
        }
    }
}

@Composable
private fun DockItem(
    destination: Destination,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    isSelected: Boolean,
    iconColor: Color,
    onSelected: () -> Unit,
) {
    val palette = LocalPalette.current

    Box(
        modifier = Modifier.size(56.dp),
        contentAlignment = Alignment.Center,
    ) {
        androidx.compose.material3.IconButton(
            onClick = onSelected,
            modifier = Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(
                    color = if (isSelected) palette.accent.copy(alpha = 0.15f) else Color.Transparent,
                    shape = CircleShape,
                ),
        ) {
            Icon(
                imageVector = icon,
                contentDescription = label,
                tint = iconColor,
                modifier = Modifier.size(22.dp),
            )
        }
    }
}

private fun Destination.icon(): androidx.compose.ui.graphics.vector.ImageVector {
    return when (this) {
        Destination.Home -> Icons.Filled.Home
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
