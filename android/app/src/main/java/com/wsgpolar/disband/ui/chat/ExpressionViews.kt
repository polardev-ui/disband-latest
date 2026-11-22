package com.wsgpolar.disband.ui.chat

import android.os.Build
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.InlineTextContent
import androidx.compose.foundation.text.appendInlineContent
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.Placeholder
import androidx.compose.ui.text.PlaceholderVerticalAlign
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.ImageLoader
import coil.compose.AsyncImage
import coil.decode.GifDecoder
import coil.decode.ImageDecoderDecoder
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.data.ExpressionStore

/** An image loader that animates GIF, APNG and animated WebP (stickers and emoji). */
@Composable
fun rememberAnimatedImageLoader(): ImageLoader {
    val context = LocalContext.current
    return remember(context) {
        ImageLoader.Builder(context).components {
            if (Build.VERSION.SDK_INT >= 28) add(ImageDecoderDecoder.Factory()) else add(GifDecoder.Factory())
        }.build()
    }
}

/**
 * Custom emoji (`<:name:id>`) drawn inside message text, as on the web: each
 * token becomes an inline image the height of the line. Styles around the
 * token are kept.
 */
fun withCustomEmoji(text: AnnotatedString, size: TextUnit = 20.sp): Pair<AnnotatedString, Map<String, InlineTextContent>> {
    if (!text.text.contains("<:") && !text.text.contains("<a:")) return text to emptyMap()
    val matches = ExpressionStore.TOKEN.findAll(text.text).toList()
    if (matches.isEmpty()) return text to emptyMap()
    val inline = HashMap<String, InlineTextContent>()
    val out = buildAnnotatedString {
        var last = 0
        for (m in matches) {
            append(text.subSequence(last, m.range.first))
            val name = m.groupValues[1]
            val id = m.groupValues[2]
            val key = "emoji:$id"
            appendInlineContent(key, ":$name:")
            if (key !in inline) {
                inline[key] = InlineTextContent(Placeholder(size, size, PlaceholderVerticalAlign.TextCenter)) {
                    CustomEmojiInline(id, name)
                }
            }
            last = m.range.last + 1
        }
        append(text.subSequence(last, text.length))
    }
    return out to inline
}

/** A message that is nothing but custom emoji (up to three) shows them large. */
fun isJumboCustomEmoji(content: String): Boolean {
    val trimmed = content.trim()
    val count = ExpressionStore.TOKEN.findAll(trimmed).count()
    return count in 1..3 && ExpressionStore.TOKEN.replace(trimmed, "").isBlank()
}

@Composable
private fun CustomEmojiInline(id: String, name: String) {
    val emoji = ExpressionStore.emoji(id)
    val palette = LocalPalette.current
    if (emoji != null) {
        AsyncImage(
            model = emoji.url,
            imageLoader = rememberAnimatedImageLoader(),
            contentDescription = ":$name:",
            modifier = Modifier.fillMaxSize(),
        )
    } else if (ExpressionStore.isEmojiMissing(id)) {
        // Gone: a small mark rather than an empty gap.
        Text("◌", color = palette.textMuted, fontSize = 12.sp, modifier = Modifier.semantics { contentDescription = ":$name:" })
    }
}

/** A sticker sent in chat: 160dp with no frame. One that can't be found shows its name. */
@Composable
fun StickerMessage(id: String, name: String?) {
    val palette = LocalPalette.current
    val sticker = ExpressionStore.sticker(id)
    Box(Modifier.padding(top = 4.dp).size(160.dp), contentAlignment = Alignment.Center) {
        when {
            sticker != null -> AsyncImage(
                model = sticker.url,
                imageLoader = rememberAnimatedImageLoader(),
                contentDescription = "${sticker.name} sticker",
                modifier = Modifier.fillMaxSize(),
            )
            ExpressionStore.isStickerMissing(id) -> Column(
                Modifier
                    .fillMaxSize()
                    .border(2.dp, palette.textMuted.copy(alpha = 0.4f), RoundedCornerShape(16.dp))
                    .padding(10.dp),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(name ?: "Sticker", color = palette.textSecondary, fontSize = 13.sp, fontWeight = FontWeight.Medium, textAlign = TextAlign.Center)
                Text("This sticker isn't available.", color = palette.textMuted, fontSize = 12.sp, textAlign = TextAlign.Center)
            }
        }
    }
}

/**
 * Stickers and custom emoji from every space you're in. A sticker sends at
 * once; an emoji goes into the message as `:name:` (sent as `<:name:id>`, so
 * it shows in any chat).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExpressionPickerSheet(
    onDismiss: () -> Unit,
    onSticker: (ExpressionStore.SpaceSticker) -> Unit,
    onEmoji: (String) -> Unit,
) {
    val palette = LocalPalette.current
    val haptics = LocalHapticFeedback.current
    val loader = rememberAnimatedImageLoader()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var stickersTab by remember { mutableStateOf(true) }
    var query by remember { mutableStateOf("") }
    LaunchedEffect(Unit) { ExpressionStore.loadMySpaces() }
    val q = query.trim().lowercase()

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState, containerColor = palette.background) {
        Column(Modifier.fillMaxWidth().fillMaxHeight(0.85f).padding(horizontal = 16.dp)) {
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(palette.elevated).padding(3.dp),
                horizontalArrangement = Arrangement.spacedBy(3.dp),
            ) {
                listOf(true to "Stickers", false to "Emoji").forEach { (isStickers, label) ->
                    val on = stickersTab == isStickers
                    Box(
                        Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(8.dp))
                            .background(if (on) palette.surface else palette.elevated)
                            .clickable { stickersTab = isStickers }
                            .padding(vertical = 8.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(label, color = if (on) palette.textPrimary else palette.textSecondary, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
            BasicTextField(
                value = query,
                onValueChange = { query = it },
                singleLine = true,
                textStyle = TextStyle(color = palette.textPrimary, fontSize = 15.sp),
                cursorBrush = SolidColor(palette.accent),
                modifier = Modifier
                    .padding(vertical = 10.dp)
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(10.dp))
                    .background(palette.elevated)
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                decorationBox = { field ->
                    if (query.isEmpty()) Text(
                        if (stickersTab) "Find the perfect sticker" else "Find the perfect emoji",
                        color = palette.textMuted, fontSize = 15.sp,
                    )
                    field()
                },
            )

            if (stickersTab) {
                val groups = ExpressionStore.stickerSpaces().map { (space, list) ->
                    space to list.filter { q.isEmpty() || it.name.lowercase().contains(q) || (it.tags ?: "").lowercase().contains(q) }
                }.filter { it.second.isNotEmpty() }
                if (groups.isEmpty()) Empty(
                    if (q.isEmpty()) "None of your spaces have stickers yet. A space's owner can add them on the web, in its settings."
                    else "No stickers match “$query”.",
                )
                // Lazy, so a long list only draws the rows on screen.
                LazyVerticalGrid(GridCells.Fixed(4), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    groups.forEach { (space, stickers) ->
                        item(key = "h-${space.id}", span = { GridItemSpan(maxLineSpan) }) { SpaceHeader(space) }
                        items(stickers, key = { it.id }) { sticker ->
                            AsyncImage(
                                model = sticker.url,
                                imageLoader = loader,
                                contentDescription = sticker.name,
                                modifier = Modifier
                                    .aspectRatio(1f)
                                    .clip(RoundedCornerShape(10.dp))
                                    .clickable {
                                        haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                                        onSticker(sticker)
                                        onDismiss()
                                    }
                                    .padding(4.dp),
                            )
                        }
                    }
                }
            } else {
                val choices = ExpressionStore.choices().filter { q.isEmpty() || it.label.lowercase().contains(q) }
                val bySpace = choices.groupBy { it.emoji.serverId }
                val spaces = ExpressionStore.spaces.filter { bySpace.containsKey(it.id) }
                if (spaces.isEmpty()) Empty(
                    if (q.isEmpty()) "None of your spaces have custom emoji yet." else "No emoji match “$query”.",
                )
                LazyVerticalGrid(GridCells.Fixed(7), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    spaces.forEach { space ->
                        item(key = "h-${space.id}", span = { GridItemSpan(maxLineSpan) }) { SpaceHeader(space) }
                        items(bySpace[space.id] ?: emptyList(), key = { it.emoji.id }) { choice ->
                            Box(
                                Modifier
                                    .aspectRatio(1f)
                                    .clip(RoundedCornerShape(8.dp))
                                    .clickable {
                                        onEmoji(":${choice.label}:")
                                        onDismiss()
                                    },
                                contentAlignment = Alignment.Center,
                            ) {
                                AsyncImage(
                                    model = choice.emoji.url,
                                    imageLoader = loader,
                                    contentDescription = ":${choice.label}:",
                                    modifier = Modifier.size(32.dp),
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SpaceHeader(space: ExpressionStore.Space) {
    val palette = LocalPalette.current
    Row(Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 2.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(22.dp).clip(RoundedCornerShape(6.dp)).background(palette.elevated), contentAlignment = Alignment.Center) {
            if (space.iconUrl != null) {
                AsyncImage(model = space.iconUrl, contentDescription = null, modifier = Modifier.fillMaxSize())
            } else {
                Text(space.name.take(2), color = palette.textPrimary, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
            }
        }
        Text(space.name, color = palette.textSecondary, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(start = 8.dp))
    }
}

@Composable
private fun Empty(message: String) {
    val palette = LocalPalette.current
    Text(
        message, color = palette.textMuted, fontSize = 14.sp, textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth().padding(top = 40.dp).width(280.dp),
    )
}
