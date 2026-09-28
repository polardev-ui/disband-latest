package com.wsgpolar.disband.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.wsgpolar.disband.core.Palette
import com.wsgpolar.disband.data.StoredAttachment

/**
 * Several images on one message, laid out the way the web and iOS lay them out.
 *
 * The row shape is copied from `AttachmentGrid.tsx` rather than reinvented,
 * because the same message has to read the same whichever client is open: a
 * lone leading row of one or two gives the set a hero, and rows of three stop
 * later images shrinking to thumbnails. Change one client and change them all.
 *
 * Only images and GIFs are tiled. A video needs its play control and a file
 * needs its name and size, and neither survives being cropped into a cell.
 */
private const val GAP = 3

/** How many images go on each row, by total count. Mirrors `rowsFor`. */
internal fun mosaicRows(count: Int): List<Int> = when (count) {
    1 -> listOf(1)
    2 -> listOf(2)
    3 -> listOf(3)          // hero beside a stacked pair — handled separately
    4 -> listOf(2, 2)
    5 -> listOf(2, 3)
    6 -> listOf(3, 3)
    7 -> listOf(1, 3, 3)
    8 -> listOf(2, 3, 3)
    9 -> listOf(3, 3, 3)
    10 -> listOf(1, 3, 3, 3)
    else -> buildList {
        // Past ten cannot be sent, but is laid out rather than dropped.
        var left = count
        while (left > 0) {
            add(minOf(3, left))
            left -= 3
        }
    }
}

/** A row of one is the hero and gets more height than a row of three. */
private fun rowHeight(perRow: Int) = when (perRow) {
    1 -> 230
    2 -> 150
    else -> 110
}

@Composable
fun AttachmentMosaic(
    attachments: List<StoredAttachment>,
    palette: Palette,
    modifier: Modifier = Modifier,
    onOpen: (StoredAttachment) -> Unit = {},
) {
    val tiles = attachments.filter { it.type == "image" || it.type == "gif" }
    if (tiles.size < 2) return

    val shape = RoundedCornerShape(10.dp)

    if (tiles.size == 3) {
        // Three is the one count that is not row-based.
        Row(
            modifier.widthIn(max = 280.dp).height(220.dp).clip(shape),
            horizontalArrangement = Arrangement.spacedBy(GAP.dp),
        ) {
            Tile(tiles[0], palette, Modifier.weight(1f).fillMaxSize(), onOpen)
            Column(
                Modifier.weight(1f).fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(GAP.dp),
            ) {
                Tile(tiles[1], palette, Modifier.weight(1f).fillMaxWidth(), onOpen)
                Tile(tiles[2], palette, Modifier.weight(1f).fillMaxWidth(), onOpen)
            }
        }
        return
    }

    var remaining = tiles
    val built = buildList {
        for (perRow in mosaicRows(tiles.size)) {
            if (remaining.isEmpty()) break
            val take = minOf(perRow, remaining.size)
            add(remaining.take(take))
            remaining = remaining.drop(take)
        }
    }

    Column(
        modifier.widthIn(max = 280.dp).clip(shape),
        verticalArrangement = Arrangement.spacedBy(GAP.dp),
    ) {
        built.forEach { row ->
            Row(
                Modifier.fillMaxWidth().height(rowHeight(row.size).dp),
                horizontalArrangement = Arrangement.spacedBy(GAP.dp),
            ) {
                row.forEach { item ->
                    Tile(item, palette, Modifier.weight(1f).fillMaxSize(), onOpen)
                }
            }
        }
    }
}

@Composable
private fun Tile(
    attachment: StoredAttachment,
    palette: Palette,
    modifier: Modifier,
    onOpen: (StoredAttachment) -> Unit,
) {
    AsyncImage(
        model = attachment.url,
        contentDescription = attachment.name ?: "Image",
        // Crop, not fit: every cell in a row is the same height, so a portrait
        // photo beside a landscape one has to be cropped or the row grows gaps.
        contentScale = ContentScale.Crop,
        modifier = modifier
            .background(palette.elevated)
            .clickable { onOpen(attachment) },
    )
}

/** A single image, when a message carries exactly one. */
@Composable
fun SingleImage(
    attachment: StoredAttachment,
    palette: Palette,
    modifier: Modifier = Modifier,
    onOpen: (StoredAttachment) -> Unit = {},
) {
    AsyncImage(
        model = attachment.url,
        contentDescription = attachment.name ?: "Image",
        contentScale = ContentScale.Fit,
        modifier = modifier
            .widthIn(max = 280.dp)
            .heightIn(max = 300.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(palette.elevated)
            .clickable { onOpen(attachment) },
    )
}
