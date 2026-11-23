package com.wsgpolar.disband.ui.chat

import android.os.Build
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.StarBorder
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.ImageLoader
import coil.compose.AsyncImage
import coil.decode.GifDecoder
import coil.decode.ImageDecoderDecoder
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.data.GifService
import com.wsgpolar.disband.data.MediaService
import com.wsgpolar.disband.data.StoredAttachment
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private enum class GifTab(val label: String) { Browse("GIFs"), Favorites("Favourites") }

/**
 * Giphy search plus the user's favourites. Tapping a GIF calls [onPick] with
 * the attachment to send (type "gif", full URL, no key — exactly what iOS
 * sends) and dismisses; long-press or the star toggles a favourite.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun GifPickerSheet(onDismiss: () -> Unit, onPick: (StoredAttachment) -> Unit) {
    val palette = LocalPalette.current
    val context = LocalContext.current
    val haptics = LocalHapticFeedback.current
    val scope = rememberCoroutineScope()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    val loader = remember(context) {
        ImageLoader.Builder(context).components {
            if (Build.VERSION.SDK_INT >= 28) add(ImageDecoderDecoder.Factory()) else add(GifDecoder.Factory())
        }.build()
    }

    var tab by remember { mutableStateOf(GifTab.Browse) }
    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<MediaService.GiphyGif>>(emptyList()) }
    var searching by remember { mutableStateOf(true) }
    var searchError by remember { mutableStateOf(false) }
    var retry by remember { mutableStateOf(0) }

    val favorites = remember { mutableStateListOf<GifService.Favorite>() }
    var favLoaded by remember { mutableStateOf(false) }
    var favError by remember { mutableStateOf(false) }
    var notice by remember { mutableStateOf<String?>(null) }

    // Debounced search; the first run (blank query) shows trending.
    LaunchedEffect(query, retry) {
        if (query.isNotBlank()) delay(350)
        searching = true
        searchError = false
        try {
            results = GifService.search(query)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            results = emptyList()
            searchError = true
        }
        searching = false
    }

    LaunchedEffect(retry) {
        favError = false
        try {
            val list = GifService.favorites()
            favorites.clear()
            favorites.addAll(list)
            favLoaded = true
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            favError = true
            favLoaded = true
        }
    }

    fun isFav(url: String): Boolean {
        val k = GifService.gifKey(url)
        return favorites.any { it.key == k }
    }

    // Optimistic, rolled back if the server refuses, like iOS.
    fun toggle(url: String) {
        val k = GifService.gifKey(url)
        val existing = favorites.firstOrNull { it.key == k }
        val snapshot = favorites.toList()
        scope.launch {
            try {
                if (existing != null) {
                    favorites.removeAll { it.key == k }
                    GifService.remove(existing)
                } else {
                    favorites.add(0, GifService.Favorite(id = null, url = url))
                    GifService.add(url)
                    runCatching { GifService.favorites() }.getOrNull()?.let {
                        favorites.clear(); favorites.addAll(it)
                    }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                favorites.clear(); favorites.addAll(snapshot)
                notice = "Could not update favourites"
            }
        }
    }

    fun pick(url: String) {
        onPick(GifService.attachmentFor(url))
        onDismiss()
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = palette.background,
    ) {
        Column(Modifier.fillMaxWidth().fillMaxHeight(0.85f)) {
            Row(
                Modifier.padding(horizontal = 16.dp).fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp)).background(palette.surface)
                    .padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(Icons.Filled.Search, null, tint = palette.textMuted, modifier = Modifier.size(20.dp))
                Box(Modifier.weight(1f)) {
                    if (query.isEmpty()) Text("Search GIFs", color = palette.textMuted, fontSize = 16.sp)
                    BasicTextField(
                        value = query,
                        onValueChange = { query = it },
                        enabled = tab == GifTab.Browse,
                        singleLine = true,
                        textStyle = TextStyle(color = palette.textPrimary, fontSize = 16.sp),
                        cursorBrush = SolidColor(palette.accent),
                        keyboardOptions = KeyboardOptions(autoCorrect = false),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }

            Row(
                Modifier.padding(16.dp).fillMaxWidth()
                    .clip(RoundedCornerShape(10.dp)).background(palette.surface).padding(3.dp),
            ) {
                GifTab.entries.forEach { t ->
                    val selected = t == tab
                    Box(
                        Modifier.weight(1f).clip(RoundedCornerShape(8.dp))
                            .background(if (selected) palette.accent else androidx.compose.ui.graphics.Color.Transparent)
                            .clickable { tab = t }
                            .padding(vertical = 8.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            t.label,
                            color = if (selected) androidx.compose.ui.graphics.Color.White else palette.textMuted,
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 14.sp,
                        )
                    }
                }
            }

            notice?.let {
                Text(it, color = palette.textMuted, fontSize = 12.sp, textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp))
                LaunchedEffect(it) { delay(2500); notice = null }
            }

            @Composable
            fun Message(text: String, action: String? = null) {
                Column(
                    Modifier.fillMaxSize().padding(32.dp),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(text, color = palette.textMuted, textAlign = TextAlign.Center)
                    if (action != null) {
                        Text(action, color = palette.accent, fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(top = 12.dp).clickable { retry++ })
                    }
                }
            }

            @Composable
            fun Tile(previewUrl: String, fullUrl: String) {
                val starred = isFav(fullUrl)
                Box(
                    Modifier.height(120.dp).fillMaxWidth().clip(RoundedCornerShape(8.dp))
                        .background(palette.elevated)
                        .combinedClickable(
                            onClick = { pick(fullUrl) },
                            onLongClick = {
                                haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                                toggle(fullUrl)
                            },
                        ),
                ) {
                    AsyncImage(
                        model = previewUrl,
                        imageLoader = loader,
                        contentDescription = "GIF",
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize(),
                    )
                    Box(
                        Modifier.align(Alignment.TopEnd).padding(4.dp).size(28.dp)
                            .clip(RoundedCornerShape(14.dp))
                            .background(androidx.compose.ui.graphics.Color.Black.copy(alpha = 0.45f))
                            .clickable { toggle(fullUrl) },
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            if (starred) Icons.Filled.Star else Icons.Outlined.StarBorder,
                            contentDescription = if (starred) "Remove from favourites" else "Add to favourites",
                            tint = if (starred) palette.accent else androidx.compose.ui.graphics.Color.White,
                            modifier = Modifier.size(18.dp),
                        )
                    }
                }
            }

            when {
                tab == GifTab.Favorites -> when {
                    !favLoaded -> Loading()
                    favError && favorites.isEmpty() -> Message("Could not load favourites.", "Try again")
                    favorites.isEmpty() -> Message("No favourites yet. Long-press a GIF to star it.")
                    else -> LazyVerticalGrid(
                        columns = GridCells.Fixed(2),
                        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 4.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        items(favorites.toList(), key = { it.key }) { Tile(it.url, it.url) }
                    }
                }
                searching && results.isEmpty() -> Loading()
                searchError -> Message("Could not load GIFs.", "Try again")
                results.isEmpty() -> Message("No GIFs")
                else -> LazyVerticalGrid(
                    columns = GridCells.Fixed(2),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(results, key = { it.id }) { gif ->
                        val full = gif.fullUrl
                        if (full != null) Tile(gif.thumbUrl ?: full, full)
                    }
                }
            }
        }
    }
}

@Composable
private fun Loading() {
    Box(Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = LocalPalette.current.accent)
    }
}
