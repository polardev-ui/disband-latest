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
import androidx.compose.foundation.layout.fillMaxHeight
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
import com.wsgpolar.disband.ui.components.GuildTagView
import com.wsgpolar.disband.ui.components.GuildTagBadgeSize

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
    /** Tapping the avatar or name opens that person's profile. */
    onAuthorClick: () -> Unit = {},
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
                    url = row.webhook?.avatarUrl ?: row.author?.avatarUrl,
                    name = row.webhook?.name ?: row.author?.name ?: "?",
                    size = 40.dp,
                    // No clip here: it would cut off the decoration, which
                    // reaches past the photo.
                    modifier = Modifier.clickable(role = Role.Button, onClickLabel = "View profile", onClick = onAuthorClick),
                    decoration = row.author?.equippedRingEffect,
                )
            }
            Spacer(Modifier.width(12.dp))

            Column(Modifier.weight(1f)) {
                if (!grouped) {
                    Row(verticalAlignment = Alignment.Bottom) {
                        Text(
                            row.webhook?.name ?: row.author?.name ?: "Unknown",
                            color = palette.textPrimary,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f, fill = false)
                                .clickable(role = Role.Button, onClickLabel = "View profile", onClick = onAuthorClick),
                        )
                        if (row.webhook != null) AppTag(palette)
                        else GuildTagView(userId = row.author?.id, size = GuildTagBadgeSize.Small)
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

                if (row.embeds.isNotEmpty()) {
                    Spacer(Modifier.height(6.dp))
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        row.embeds.forEach { EmbedCard(it, palette) }
                    }
                }

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

/** Marks a webhook's message, so nobody mistakes it for a person. */
@Composable
private fun AppTag(palette: Palette) {
    Spacer(Modifier.width(6.dp))
    Text(
        "APP",
        color = androidx.compose.ui.graphics.Color.White,
        fontSize = 10.sp,
        fontWeight = FontWeight.Bold,
        modifier = Modifier
            .clip(RoundedCornerShape(4.dp))
            .background(palette.accent)
            .padding(horizontal = 4.dp, vertical = 1.dp),
    )
}

/**
 * A rich embed, laid out the way the web draws it: a coloured bar on the
 * left, then author, linked title, description, fields, image and footer.
 * Android dropped them entirely, so a GitHub push showed only its one-line
 * summary and never the commits.
 */
@Composable
private fun EmbedCard(embed: com.wsgpolar.disband.data.Embed, palette: Palette) {
    val uriHandler = androidx.compose.ui.platform.LocalUriHandler.current
    val open: (String?) -> Unit = { url ->
        if (url != null && url.startsWith("https://")) runCatching { uriHandler.openUri(url) }
    }
    val bar = embed.color?.let { androidx.compose.ui.graphics.Color(0xFF000000 or (it and 0xFFFFFF)) } ?: palette.textMuted

    Row(
        Modifier
            .widthIn(max = 420.dp)
            .fillMaxWidth()
            .clip(RoundedCornerShape(4.dp))
            .background(palette.elevated)
            .height(androidx.compose.foundation.layout.IntrinsicSize.Min)
    ) {
        Box(Modifier.width(4.dp).fillMaxHeight().background(bar))
        Row(Modifier.weight(1f).padding(start = 12.dp, end = 12.dp, top = 8.dp, bottom = 10.dp)) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                embed.author?.takeIf { it.name.isNotBlank() }?.let { author ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (author.iconUrl != null) {
                            AsyncImage(
                                model = author.iconUrl,
                                contentDescription = null,
                                modifier = Modifier.size(20.dp).clip(CircleShape),
                            )
                            Spacer(Modifier.width(6.dp))
                        }
                        Text(
                            author.name,
                            color = palette.textPrimary,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = if (author.url != null) Modifier.clickable { open(author.url) } else Modifier,
                        )
                    }
                }
                embed.title?.takeIf { it.isNotBlank() }?.let { title ->
                    Text(
                        title,
                        color = if (embed.url != null) palette.accent else palette.textPrimary,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold,
                        modifier = if (embed.url != null) Modifier.clickable { open(embed.url) } else Modifier,
                    )
                }
                embed.description?.takeIf { it.isNotBlank() }?.let { MarkdownBody(it, palette) }
                embed.fields?.takeIf { it.isNotEmpty() }?.let { fields ->
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        // Inline fields sit side by side, up to three a row, like the web.
                        val rows = mutableListOf<List<com.wsgpolar.disband.data.EmbedField>>()
                        var current = mutableListOf<com.wsgpolar.disband.data.EmbedField>()
                        for (field in fields) {
                            if (!field.inline || current.size == 3) {
                                if (current.isNotEmpty()) rows += current
                                current = mutableListOf()
                            }
                            current += field
                            if (!field.inline) {
                                rows += current
                                current = mutableListOf()
                            }
                        }
                        if (current.isNotEmpty()) rows += current
                        rows.forEach { line ->
                            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                line.forEach { field ->
                                    Column(Modifier.weight(1f)) {
                                        Text(field.name, color = palette.textPrimary, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                                        MarkdownBody(field.value, palette)
                                    }
                                }
                            }
                        }
                    }
                }
                embed.image?.url?.takeIf { it.startsWith("https://") }?.let { url ->
                    AsyncImage(
                        model = url,
                        contentDescription = embed.title,
                        contentScale = ContentScale.Fit,
                        modifier = Modifier
                            .padding(top = 4.dp)
                            .fillMaxWidth()
                            .heightIn(max = 300.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .clickable { open(url) },
                    )
                }
                val footer = embed.footer?.text?.takeIf { it.isNotBlank() }
                val time = embed.timestamp?.let { TimeFormat.short(it) }
                if (footer != null || time != null) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        embed.footer?.iconUrl?.let {
                            AsyncImage(model = it, contentDescription = null, modifier = Modifier.size(16.dp).clip(CircleShape))
                            Spacer(Modifier.width(6.dp))
                        }
                        Text(
                            listOfNotNull(footer, time).joinToString(" • "),
                            color = palette.textMuted,
                            fontSize = 11.sp,
                        )
                    }
                }
            }
            embed.thumbnail?.url?.takeIf { it.startsWith("https://") }?.let { url ->
                Spacer(Modifier.width(10.dp))
                AsyncImage(
                    model = url,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.size(64.dp).clip(RoundedCornerShape(4.dp)),
                )
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
