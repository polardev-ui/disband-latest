package com.wsgpolar.disband.ui.main

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.Forum
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wsgpolar.disband.core.Brand
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.core.Radii
import com.wsgpolar.disband.core.seeded
import com.wsgpolar.disband.data.Server
import com.wsgpolar.disband.data.UserStatus
import com.wsgpolar.disband.ui.AvatarImage

private val RAIL_WIDTH = 72.dp
private val ICON_SIZE = 48.dp

/**
 * The strip of spaces down the left edge, mirroring iOS ServerRail: the
 * Messages tile on an accent gradient, a hairline, then the spaces, then
 * add/explore. Scrollable, because an account in a dozen spaces overflows any
 * phone.
 */
@Composable
fun ServerRail(
    servers: List<Server>,
    selectedServerId: String?,
    onServerSelected: (Server) -> Unit,
    onInboxSelected: () -> Unit,
    modifier: Modifier = Modifier,
    selfStatus: UserStatus = UserStatus.Offline,
    unreadForServer: (String) -> Int = { 0 },
    onAddServer: () -> Unit = {},
    onExplore: () -> Unit = {},
) {
    val palette = LocalPalette.current

    Column(
        modifier = modifier
            .width(RAIL_WIDTH)
            .fillMaxHeight()
            .background(palette.background)
            .verticalScroll(rememberScrollState())
            .padding(vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        RailButton(
            selected = selectedServerId == null,
            label = "Messages",
            onClick = onInboxSelected,
        ) {
            Box(
                Modifier
                    .size(ICON_SIZE)
                    .background(
                        Brush.verticalGradient(listOf(palette.accent, palette.accentSoft)),
                        RoundedCornerShape(Radii.railSquircle),
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    Icons.Filled.Forum,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(22.dp),
                )
                // Own presence dot on the inbox tile, as on iOS.
                if (selfStatus == UserStatus.Online) {
                    Box(
                        Modifier
                            .align(Alignment.BottomEnd)
                            .offset(x = 2.dp, y = 2.dp)
                            .size(14.dp)
                            .clip(CircleShape)
                            .border(2.dp, palette.background, CircleShape)
                            .background(Brand.online),
                    )
                }
            }
        }

        Box(
            Modifier
                .width(26.dp)
                .height(2.dp)
                .clip(CircleShape)
                .background(palette.divider),
        )

        servers.forEach { server ->
            RailButton(
                selected = server.id == selectedServerId,
                label = server.name,
                badge = unreadForServer(server.id),
                onClick = { onServerSelected(server) },
            ) {
                if (server.iconUrl != null) {
                    AvatarImage(url = server.iconUrl, name = server.name, size = ICON_SIZE)
                } else {
                    Box(
                        Modifier.size(ICON_SIZE).background(Color.seeded(server.id)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            initials(server.name),
                            color = Color.White,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }
            }
        }

        RailActionButton(label = "Add a space", tint = Brand.online, onClick = onAddServer) {
            Icon(
                Icons.Filled.Add,
                contentDescription = null,
                tint = Brand.online,
                modifier = Modifier.size(22.dp),
            )
        }

        RailActionButton(label = "Explore spaces", tint = palette.accent, onClick = onExplore) {
            Icon(
                Icons.Filled.Explore,
                contentDescription = null,
                tint = palette.accent,
                modifier = Modifier.size(22.dp),
            )
        }

        // Clears the floating dock so the last space is never trapped under it.
        Spacer(Modifier.height(80.dp))
    }
}

/**
 * One space. Squircle when selected, circle otherwise, with the white pill on
 * the leading edge — the same morph the desktop and iOS rails use. Pressing
 * scales the tile to 0.92, matching the iOS spring.
 */
@Composable
private fun RailButton(
    selected: Boolean,
    label: String,
    onClick: () -> Unit,
    badge: Int = 0,
    icon: @Composable () -> Unit,
) {
    val palette = LocalPalette.current
    val corner by animateDpAsState(
        if (selected) Radii.railSquircle else ICON_SIZE / 2,
        label = "railCorner",
    )
    val pillHeight by animateDpAsState(if (selected) 38.dp else 0.dp, label = "railPill")
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) 0.92f else 1f, label = "railScale")

    Box(
        Modifier.width(RAIL_WIDTH).height(ICON_SIZE),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier
                .align(Alignment.CenterStart)
                .padding(start = 2.dp)
                .width(4.dp)
                .height(pillHeight)
                .clip(CircleShape)
                .background(Color.White),
        )
        Box(
            Modifier
                .size(ICON_SIZE)
                .graphicsLayer {
                    scaleX = scale
                    scaleY = scale
                }
                .clip(RoundedCornerShape(corner))
                .clickable(
                    interactionSource = interaction,
                    indication = null,
                    onClickLabel = label,
                    onClick = onClick,
                ),
        ) {
            icon()
            if (badge > 0) {
                RailBadge(count = badge, strokeColor = palette.background)
            }
        }
    }
}

/** Circular action tile (add / explore) sitting on a surface circle. */
@Composable
private fun RailActionButton(
    label: String,
    tint: Color,
    onClick: () -> Unit,
    icon: @Composable () -> Unit,
) {
    val palette = LocalPalette.current
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) 0.92f else 1f, label = "railActionScale")

    Box(
        Modifier
            .size(ICON_SIZE)
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
            }
            .clip(CircleShape)
            .background(palette.surface)
            .clickable(
                interactionSource = interaction,
                indication = null,
                onClickLabel = label,
                onClick = onClick,
            ),
        contentAlignment = Alignment.Center,
    ) {
        icon()
    }
}

/**
 * Unread badge: a #DA373C capsule, minimum 20dp wide, with a 3dp stroke in
 * the rail's background colour so it reads as cut out of the tile.
 */
@Composable
private fun BoxScope.RailBadge(count: Int, strokeColor: Color) {
    Box(
        Modifier
            .align(Alignment.BottomEnd)
            .offset(x = 4.dp, y = 4.dp)
            .border(3.dp, strokeColor, CircleShape)
            .clip(CircleShape)
            .background(Brand.danger)
            .padding(horizontal = 5.dp)
            .height(14.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            if (count > 99) "99+" else "$count",
            color = Color.White,
            fontSize = 9.sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            maxLines = 1,
        )
    }
}

private fun initials(name: String): String =
    name.trim().split(" ").filter { it.isNotBlank() }.take(2)
        .joinToString("") { it.first().uppercase() }
        .ifEmpty { "?" }
