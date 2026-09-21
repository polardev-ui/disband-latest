package com.wsgpolar.disband.ui.main

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Forum
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.core.seeded
import com.wsgpolar.disband.data.Server
import com.wsgpolar.disband.ui.AvatarImage

private val RAIL_WIDTH = 72.dp
private val ICON_SIZE = 48.dp

/**
 * The strip of spaces down the left edge, mirroring iOS ServerRail: messages
 * on top, a hairline, then the servers. Scrollable, because an account in a
 * dozen spaces overflows any phone.
 */
@Composable
fun ServerRail(
    servers: List<Server>,
    selectedServerId: String?,
    onServerSelected: (Server) -> Unit,
    onInboxSelected: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val palette = LocalPalette.current

    Column(
        modifier = modifier
            .width(RAIL_WIDTH)
            .fillMaxHeight()
            .background(palette.surface)
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
                Modifier.size(ICON_SIZE).background(palette.accent),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    Icons.Filled.Forum,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(22.dp),
                )
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

        // Clears the floating dock so the last space is never trapped under it.
        Spacer(Modifier.height(80.dp))
    }
}

/**
 * One space. Squircle when selected, circle otherwise, with the white pill on
 * the leading edge — the same morph the desktop and iOS rails use.
 */
@Composable
private fun RailButton(
    selected: Boolean,
    label: String,
    onClick: () -> Unit,
    icon: @Composable () -> Unit,
) {
    val corner by animateDpAsState(if (selected) 16.dp else 24.dp, label = "railCorner")
    val pillHeight by animateDpAsState(if (selected) 38.dp else 0.dp, label = "railPill")
    val interaction = remember { MutableInteractionSource() }

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
                .clip(RoundedCornerShape(corner))
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
}

private fun initials(name: String): String =
    name.trim().split(" ").filter { it.isNotBlank() }.take(2)
        .joinToString("") { it.first().uppercase() }
        .ifEmpty { "?" }
