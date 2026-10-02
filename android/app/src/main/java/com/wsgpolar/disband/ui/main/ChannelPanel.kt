package com.wsgpolar.disband.ui.main

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Tag
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.wsgpolar.disband.core.Brand
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.core.Radii
import com.wsgpolar.disband.core.ShellMetrics
import com.wsgpolar.disband.data.Channel
import com.wsgpolar.disband.data.ChannelCategory
import com.wsgpolar.disband.data.ChannelType
import com.wsgpolar.disband.data.Server
import com.wsgpolar.disband.ui.AvatarImage

/**
 * One occupant of a voice channel, for the live member strip under a voice
 * row. `speaking` drives the green ring, matching iOS.
 */
data class VoiceOccupant(
    val id: String,
    val name: String,
    val avatarUrl: String? = null,
    val speaking: Boolean = false,
)

/**
 * A server's channels, grouped by category — the Android counterpart of iOS
 * ChannelPanel: a banner header carrying the space's name, Invite and Members,
 * then collapsible category sections.
 */
@Composable
fun ChannelPanel(
    server: Server?,
    categories: List<ChannelCategory>,
    channels: List<Channel>,
    selectedChannelId: String?,
    onChannelSelected: (Channel) -> Unit,
    onInvite: () -> Unit = {},
    onMembers: () -> Unit = {},
    onOverflow: () -> Unit = {},
    modifier: Modifier = Modifier,
    occupantsFor: (Channel) -> List<VoiceOccupant> = { emptyList() },
) {
    val palette = LocalPalette.current
    // Survives rotation — losing every collapsed section on rotate read as broken.
    var collapsed by rememberSaveable { mutableStateOf(emptySet<String>()) }
    val navBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()

    // Channels in no category come first and un-headed, as on iOS.
    val uncategorised = channels.filter { it.categoryId == null }.sortedBy { it.position }
    val sections = categories.sortedBy { it.position }
        .map { it to channels.inCategory(it) }
        .filter { (_, inside) -> inside.isNotEmpty() }

    LazyColumn(
        // The SpacesView panel supplies the surface background.
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = navBottom + ShellMetrics.listBottomMargin),
    ) {
        if (server != null) {
            item(key = "header") { ServerHeader(server, onInvite, onMembers, onOverflow) }
        }

        if (channels.isEmpty()) {
            item(key = "empty") {
                Column(
                    Modifier.fillMaxWidth().padding(top = 60.dp, start = 32.dp, end = 32.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        "No channels yet.",
                        color = palette.textPrimary,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        "Channels your spaces create will show up here.",
                        color = palette.textMuted,
                        fontSize = 13.sp,
                    )
                }
            }
        }

        items(uncategorised, key = { it.id }) { channel ->
            ChannelRow(
                channel = channel,
                isSelected = channel.id == selectedChannelId,
                onSelected = { onChannelSelected(channel) },
                occupants = occupantsFor(channel),
                modifier = Modifier.padding(horizontal = 8.dp),
            )
        }

        sections.forEach { (category, inside) ->
            val isCollapsed = category.id in collapsed
            item(key = "cat-${category.id}") {
                CategoryHeader(
                    title = category.name,
                    collapsed = isCollapsed,
                    onToggle = {
                        collapsed = if (isCollapsed) collapsed - category.id else collapsed + category.id
                    },
                )
            }
            if (!isCollapsed) {
                items(inside, key = { it.id }) { channel ->
                    ChannelRow(
                        channel = channel,
                        isSelected = channel.id == selectedChannelId,
                        onSelected = { onChannelSelected(channel) },
                        occupants = occupantsFor(channel),
                        modifier = Modifier.padding(horizontal = 8.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun ServerHeader(
    server: Server,
    onInvite: () -> Unit,
    onMembers: () -> Unit,
    onOverflow: () -> Unit,
) {
    val palette = LocalPalette.current
    Column {
        Box(Modifier.fillMaxWidth().height(118.dp)) {
            // Coil directly rather than AvatarImage: that one clips to a
            // circle at a fixed size, which is right for a face and wrong for
            // a banner. Spaces without a banner fall back to the accent
            // gradient, as iOS does.
            if (!server.bannerUrl.isNullOrBlank()) {
                AsyncImage(
                    model = server.bannerUrl,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                )
            } else {
                Box(
                    Modifier.fillMaxSize().background(
                        Brush.verticalGradient(listOf(palette.accent, palette.accentSoft)),
                    ),
                )
            }
            // Fade the banner into the surface so the name stays readable over
            // whatever image the space happens to use.
            Box(
                Modifier.fillMaxSize().background(
                    Brush.verticalGradient(
                        listOf(Color.Transparent, palette.surface.copy(alpha = 0.95f)),
                    ),
                ),
            )
            Row(
                Modifier
                    .align(Alignment.BottomStart)
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    server.name,
                    color = palette.textPrimary,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                if (server.verified == true) {
                    Icon(
                        Icons.Filled.VerifiedUser,
                        contentDescription = "Verified space",
                        tint = Brand.verified,
                        modifier = Modifier.size(16.dp),
                    )
                }
                Spacer(Modifier.weight(1f))
                Box(
                    Modifier
                        .size(48.dp)
                        .clip(CircleShape)
                        .background(palette.surface.copy(alpha = 0.55f))
                        .border(1.dp, Color.White.copy(alpha = 0.08f), CircleShape)
                        .clickable(onClickLabel = "Space options", onClick = onOverflow),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        Icons.Filled.MoreHoriz,
                        contentDescription = null,
                        tint = palette.textPrimary,
                        modifier = Modifier.size(18.dp),
                    )
                }
            }
        }

        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            PillButton("Invite", Icons.Filled.PersonAdd, Modifier.weight(1f), onInvite)
            PillButton("Members", Icons.Filled.People, Modifier.weight(1f), onMembers)
        }
    }
}

@Composable
private fun PillButton(
    label: String,
    icon: ImageVector,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val palette = LocalPalette.current
    Row(
        modifier
            .heightIn(min = 40.dp)
            .clip(CircleShape)
            .background(palette.elevated)
            .clickable(
                role = androidx.compose.ui.semantics.Role.Button,
                onClickLabel = label,
                onClick = onClick,
            )
            .padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = palette.textPrimary, modifier = Modifier.size(16.dp))
        Spacer(Modifier.width(8.dp))
        Text(label, color = palette.textPrimary, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun CategoryHeader(title: String, collapsed: Boolean, onToggle: () -> Unit) {
    val palette = LocalPalette.current
    val rotation by animateFloatAsState(if (collapsed) -90f else 0f, label = "categoryChevron")
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(Radii.press))
            .clickable(
                role = androidx.compose.ui.semantics.Role.Button,
                onClickLabel = if (collapsed) "Expand $title" else "Collapse $title",
                onClick = onToggle,
            )
            .padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 6.dp)
            .heightIn(min = 40.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(
            title.uppercase(),
            color = palette.textMuted,
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.6.sp,
        )
        Icon(
            Icons.Filled.ExpandMore,
            contentDescription = null,
            tint = palette.textMuted,
            modifier = Modifier.size(14.dp).rotate(rotation),
        )
    }
}

@Composable
private fun ChannelRow(
    channel: Channel,
    isSelected: Boolean,
    onSelected: () -> Unit,
    occupants: List<VoiceOccupant>,
    modifier: Modifier = Modifier,
) {
    val palette = LocalPalette.current
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()

    // Voice takes the speaker, read-only announcement channels the lock, the
    // rest the hash — the same three iOS uses. The glyph carries the "#", so
    // the name is printed plain rather than with one typed in front of it.
    val icon = when {
        channel.type == ChannelType.Voice -> Icons.Filled.VolumeUp
        channel.readOnly == true -> Icons.Filled.Lock
        else -> Icons.Filled.Tag
    }
    val iconDescription = when {
        channel.type == ChannelType.Voice -> "Voice channel"
        channel.readOnly == true -> "Announcement channel"
        else -> "Text channel"
    }

    Row(
        modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .clip(RoundedCornerShape(Radii.press))
            .background(
                when {
                    isSelected -> palette.accent.copy(alpha = 0.15f)
                    pressed -> palette.elevated
                    else -> Color.Transparent
                },
            )
            .clickable(
                interactionSource = interaction,
                indication = androidx.compose.foundation.LocalIndication.current,
                role = androidx.compose.ui.semantics.Role.Button,
                onClickLabel = "Open #${channel.name}",
                onClick = onSelected,
            )
            .padding(horizontal = 10.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(
            icon,
            contentDescription = iconDescription,
            tint = if (isSelected) palette.accent else palette.textSecondary,
            modifier = Modifier.size(18.dp),
        )
        Text(
            channel.name,
            color = if (isSelected) palette.textPrimary else palette.textSecondary,
            fontSize = 15.sp,
            fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f, fill = false),
        )
        Spacer(Modifier.weight(1f))
        if (channel.type == ChannelType.Voice && occupants.isNotEmpty()) {
            VoiceOccupants(occupants)
        }
    }
}

/**
 * Live voice state on a row: an occupant-count capsule followed by the member
 * avatars (24dp, green ring when speaking), as on iOS.
 */
@Composable
private fun VoiceOccupants(occupants: List<VoiceOccupant>) {
    val palette = LocalPalette.current
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Row(
            Modifier
                .clip(CircleShape)
                .background(palette.elevated)
                .padding(horizontal = 8.dp, vertical = 3.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Icon(
                Icons.Filled.VolumeUp,
                contentDescription = null,
                tint = palette.textMuted,
                modifier = Modifier.size(12.dp),
            )
            Text(
                "${occupants.size}",
                color = palette.textMuted,
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
        occupants.take(3).forEach { occupant ->
            Box {
                AvatarImage(
                    url = occupant.avatarUrl,
                    name = occupant.name,
                    size = 24.dp,
                )
                if (occupant.speaking) {
                    Box(
                        Modifier
                            .size(24.dp)
                            .clip(CircleShape)
                            .border(2.dp, Brand.online, CircleShape),
                    )
                }
            }
        }
        if (occupants.size > 3) {
            Text(
                "+${occupants.size - 3}",
                color = palette.textMuted,
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

private fun List<Channel>.inCategory(category: ChannelCategory): List<Channel> =
    filter { it.categoryId == category.id }.sortedBy { it.position }
