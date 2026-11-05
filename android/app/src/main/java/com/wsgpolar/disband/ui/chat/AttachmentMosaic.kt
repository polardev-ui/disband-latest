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
import androidx.compose.foundation.layout.size
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
    // A box already the picture's final size, so loading it never pushes
    // the conversation down. The shape is remembered once measured.
    val (w, h) = MediaAspects.box(MediaAspects.aspect(attachment.url))
    AsyncImage(
        model = attachment.url,
        contentDescription = attachment.name ?: "Image",
        contentScale = ContentScale.Crop,
        onSuccess = { state ->
            val d = state.painter.intrinsicSize
            if (d.width > 0f && d.height > 0f) MediaAspects.record(attachment.url, d.width / d.height)
        },
        modifier = modifier
            .size(w.dp, h.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(palette.elevated)
            .clickable { onOpen(attachment) },
    )
}

/** Remembered image shapes (width / height), kept across launches. */
object MediaAspects {
    private var prefs: android.content.SharedPreferences? = null
    private val cache = java.util.concurrent.ConcurrentHashMap<String, Float>()

    fun init(context: android.content.Context) {
        val p = context.getSharedPreferences("chat_media_aspects", android.content.Context.MODE_PRIVATE)
        prefs = p
        p.all.forEach { (k, v) -> (v as? Float)?.let { cache[k] = it } }
    }

    fun aspect(url: String): Float? = cache[url]

    fun record(url: String, aspect: Float) {
        if (cache[url] == aspect) return
        if (cache.size > 3000) { cache.clear(); prefs?.edit()?.clear()?.apply() }
        cache[url] = aspect
        prefs?.edit()?.putFloat(url, aspect)?.apply()
    }

    /** The box in dp: up to 280 wide and 300 tall, 4:3 until measured. */
    fun box(aspect: Float?): Pair<Float, Float> {
        val a = aspect?.takeIf { it > 0f } ?: return 280f to 210f
        val w = minOf(280f, 300f * a).coerceAtLeast(80f)
        return w to minOf(300f, w / a)
    }
}
