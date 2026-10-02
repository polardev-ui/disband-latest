package com.wsgpolar.disband.ui.chat

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Audiotrack
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.wsgpolar.disband.core.Palette
import com.wsgpolar.disband.core.TimeFormat
import com.wsgpolar.disband.data.StoredAttachment
import com.wsgpolar.disband.ui.AvatarImage

/**
 * One message, in the shape every other Disband client uses.
 *
 * Android rendered messages as chat bubbles — the sender's own messages
 * right-aligned in an accent-coloured pill, everyone else's on the left. That
 * is the iMessage shape, and Disband is not that: the web and iOS both lay a
 * message out flat, avatar on the left, name and time above the text, with
 * consecutive messages from the same person collapsing into a run under one
 * avatar. A conversation genuinely looked like a different product depending
 * on which phone you picked up, which is what "not the same style as iOS"
 * meant.
 *
 * The bubble also had nowhere to put anything: an image showed as the word
 * "Photo", there were no reactions, no reply preview, and markdown came
 * through as raw asterisks.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun MessageRow(
    modifier: Modifier = Modifier,
    row: ChatRow,
    palette: Palette,
    grouped: Boolean,
    repliedTo: ChatRow? = null,
    onOpenAttachment: (StoredAttachment) -> Unit = {},
    onLongPress: () -> Unit = {},
    onToggleReaction: (String) -> Unit = {},
) {
    val attachments = remember(row.id, row.attachments) { row.resolvedAttachments() }

    Column(
        modifier
            .fillMaxWidth()
            // A message aimed at you is tinted, the way a ping is on the web.
            .background(if (row.pingsYou) palette.accent.copy(alpha = 0.10f) else androidx.compose.ui.graphics.Color.Transparent)
            .combinedClickable(
                onClick = {},
                onLongClick = onLongPress,
            )
            .padding(horizontal = 12.dp, vertical = if (grouped) 1.dp else 4.dp)
    ) {
        if (repliedTo != null) ReplyPreview(repliedTo, palette)

        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
            // A run of messages from one person keeps one avatar; the gutter
            // is still reserved so the text stays on the same left edge.
            if (grouped) {
                Spacer(Modifier.width(40.dp))
            } else {
                AvatarImage(
                    url = row.author?.avatarUrl,
                    name = row.author?.name ?: "?",
                    size = 40.dp,
                )
            }
            Spacer(Modifier.width(12.dp))

            Column(Modifier.weight(1f)) {
                if (!grouped) {
                    Row(verticalAlignment = Alignment.Bottom) {
                        Text(
                            row.author?.name ?: "Unknown",
                            color = palette.textPrimary,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f, fill = false),
                        )
                        Spacer(Modifier.width(6.dp))
                        Text(
                            TimeFormat.short(row.createdAt),
                            color = palette.textMuted,
                            fontSize = 11.sp,
                        )
                        if (row.editedAt != null) {
                            Text(
                                " (edited)",
                                color = palette.textMuted,
                                fontSize = 11.sp,
                            )
                        }
                    }
                    Spacer(Modifier.height(2.dp))
                }

                if (row.content.isNotBlank()) {
                    MarkdownBody(row.content, palette)
                }

                Attachments(attachments, palette, onOpenAttachment)

                if (row.reactions.isNotEmpty()) {
                    Spacer(Modifier.height(4.dp))
                    ReactionChips(row.reactions, palette, onToggleReaction)
                }

                if (row.pending) {
                    Text("Sending…", color = palette.textMuted, fontSize = 11.sp)
                }
            }
        }
    }
}

/** The message body, block by block, so code keeps its own background. */
@Composable
private fun MarkdownBody(content: String, palette: Palette) {
    val blocks = remember(content, palette) { ChatMarkdown.blocks(content, palette) }
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        blocks.forEach { block ->
            when (block) {
                is ChatMarkdown.Block.Text ->
                    Text(block.content, color = palette.textPrimary, fontSize = 15.sp, lineHeight = 20.sp)

                is ChatMarkdown.Block.Quote ->
                    Row {
                        Box(
                            Modifier
                                .width(3.dp)
                                .height(18.dp)
                                .background(palette.textMuted, RoundedCornerShape(2.dp))
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(block.content, color = palette.textSecondary, fontSize = 15.sp, lineHeight = 20.sp)
                    }

                is ChatMarkdown.Block.Code ->
                    Column(
                        Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(6.dp))
                            .background(palette.elevated)
                            .padding(10.dp)
                    ) {
                        if (block.language != null) {
                            Text(
                                block.language,
                                color = palette.textMuted,
                                fontSize = 10.sp,
                                fontFamily = FontFamily.Monospace,
                            )
                            Spacer(Modifier.height(4.dp))
                        }
                        // Horizontally scrollable: wrapping code changes what
                        // it says, and a phone is narrow.
                        Text(
                            block.code,
                            color = palette.textPrimary,
                            fontSize = 13.sp,
                            fontFamily = FontFamily.Monospace,
                            lineHeight = 18.sp,
                            modifier = Modifier.horizontalScroll(rememberScrollState()),
                        )
                    }
            }
        }
    }
}

@Composable
private fun Attachments(
    attachments: List<StoredAttachment>,
    palette: Palette,
    onOpen: (StoredAttachment) -> Unit,
) {
    if (attachments.isEmpty()) return
    val tiles = attachments.filter { it.type == "image" || it.type == "gif" }
    val videos = attachments.filter { it.type == "video" }
    val rest = attachments - tiles.toSet() - videos.toSet()

    Spacer(Modifier.height(6.dp))
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        when {
            tiles.size > 1 -> AttachmentMosaic(tiles, palette, onOpen = onOpen)
            tiles.size == 1 -> SingleImage(tiles[0], palette, onOpen = onOpen)
        }
        videos.forEach { VideoCard(it, palette, onOpen) }
        rest.forEach {
            when (it.type) {
                "audio" -> AudioCard(it, palette, onOpen)
                else -> FileCard(it, palette, onOpen)
            }
        }
    }
}

/** Video with a play overlay, mirroring iOS attachment card. */
@Composable
private fun VideoCard(
    attachment: StoredAttachment,
    palette: Palette,
    onOpen: (StoredAttachment) -> Unit,
) {
    Box(
        Modifier
            .widthIn(max = 280.dp)
            .heightIn(max = 280.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(palette.elevated)
            .clickable(
                role = Role.Button,
                onClickLabel = "Play video ${attachment.name ?: ""}",
                onClick = { onOpen(attachment) },
            ),
        contentAlignment = Alignment.Center,
    ) {
        AsyncImage(
            model = attachment.url,
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .widthIn(max = 280.dp)
                .heightIn(max = 220.dp),
        )
        Box(
            Modifier
                .size(52.dp)
                .clip(CircleShape)
                .background(androidx.compose.ui.graphics.Color.Black.copy(alpha = 0.55f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.Filled.PlayArrow,
                contentDescription = null,
                tint = androidx.compose.ui.graphics.Color.White,
                modifier = Modifier.size(28.dp),
            )
        }
    }
}

/** Voice message / audio file with icon, name and size. */
@Composable
private fun AudioCard(
    attachment: StoredAttachment,
    palette: Palette,
    onOpen: (StoredAttachment) -> Unit,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(palette.elevated)
            .clickable(
                role = Role.Button,
                onClickLabel = "Play audio ${attachment.name ?: ""}",
                onClick = { onOpen(attachment) },
            )
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(40.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(palette.accent.copy(alpha = 0.15f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.Filled.Audiotrack,
                contentDescription = null,
                tint = palette.accent,
                modifier = Modifier.size(20.dp),
            )
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(
                attachment.name ?: "Voice message",
                color = palette.textPrimary,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            formatFileSize(attachment.size)?.let {
                Text(it, color = palette.textMuted, fontSize = 11.sp)
            }
        }
        Icon(
            Icons.Filled.PlayArrow,
            contentDescription = null,
            tint = palette.textSecondary,
            modifier = Modifier.size(22.dp),
        )
    }
}

/** A file: icon tile + name and size, which a cropped thumbnail cannot give. */
@Composable
private fun FileCard(
    attachment: StoredAttachment,
    palette: Palette,
    onOpen: (StoredAttachment) -> Unit,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(palette.elevated)
            .clickable(
                role = Role.Button,
                onClickLabel = "Open ${attachment.name ?: "file"}",
                onClick = { onOpen(attachment) },
            )
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(40.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(palette.accent.copy(alpha = 0.15f)),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                (attachment.name?.substringAfterLast('.', "")?.take(3)
                    ?: attachment.type.take(3)).uppercase(),
                color = palette.accent,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
            )
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(
                attachment.name ?: "File",
                color = palette.textPrimary,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            formatFileSize(attachment.size)?.let {
                Text(it, color = palette.textMuted, fontSize = 11.sp)
            }
        }
        Icon(
            Icons.Filled.Description,
            contentDescription = null,
            tint = palette.textMuted,
            modifier = Modifier.size(20.dp),
        )
    }
}

/** What this message replies to — one dimmed line above it, as on the web. */
@Composable
private fun ReplyPreview(replied: ChatRow, palette: Palette) {
    Row(
        Modifier.fillMaxWidth().padding(start = 52.dp, bottom = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AvatarImage(url = replied.author?.avatarUrl, name = replied.author?.name ?: "?", size = 16.dp)
        Spacer(Modifier.width(6.dp))
        Text(
            replied.author?.name ?: "Unknown",
            color = palette.accent,
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
        )
        Spacer(Modifier.width(6.dp))
        Text(
            replied.content.ifBlank { "attachment" },
            color = palette.textMuted,
            fontSize = 12.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun ReactionChips(
    reactions: List<ReactionSummaryRow>,
    palette: Palette,
    onToggle: (String) -> Unit,
) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        modifier = Modifier.horizontalScroll(rememberScrollState()),
    ) {
        reactions.forEach { reaction ->
            val scale by animateFloatAsState(
                targetValue = if (reaction.reacted) 1.06f else 1f,
                animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy),
                label = "reactionPop",
            )
            Row(
                Modifier
                    .graphicsLayer { scaleX = scale; scaleY = scale }
                    .clip(CircleShape)
                    .background(
                        if (reaction.reacted) palette.accent.copy(alpha = 0.2f) else palette.elevated
                    )
                    .then(
                        if (reaction.reacted) Modifier.border(1.dp, palette.accent, CircleShape)
                        else Modifier
                    )
                    .clickable(
                        role = Role.Button,
                        onClickLabel = "Toggle ${reaction.emoji} reaction",
                        onClick = { onToggle(reaction.emoji) },
                    )
                    .padding(horizontal = 9.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(reaction.emoji, fontSize = 16.sp)
                Spacer(Modifier.width(5.dp))
                Text(
                    "${reaction.count}",
                    color = if (reaction.reacted) palette.accent else palette.textSecondary,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
    }
}
