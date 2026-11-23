package com.wsgpolar.disband.ui.chat

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.data.Database
import com.wsgpolar.disband.data.Profile
import com.wsgpolar.disband.ui.AvatarImage

/** Who reacted with what, one tab per emoji, like iOS's ReactionDetailSheet. Opened by long-pressing a chip. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReactionDetailSheet(reactions: List<ReactionSummaryRow>, initialEmoji: String, onDismiss: () -> Unit) {
    val palette = LocalPalette.current
    var selected by remember { mutableStateOf(reactions.indexOfFirst { it.emoji == initialEmoji }.coerceAtLeast(0)) }
    var profiles by remember { mutableStateOf<Map<String, Profile>?>(null) }
    val allIds = remember(reactions) { reactions.flatMap { it.userIds }.distinct() }
    LaunchedEffect(allIds) {
        profiles = runCatching { Database.profiles(allIds) }.getOrDefault(emptyMap())
    }

    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = palette.surface) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(bottom = 12.dp)) {
            if (reactions.isEmpty()) return@Column
            ScrollableTabRow(selectedTabIndex = selected.coerceIn(0, reactions.lastIndex), containerColor = palette.surface, edgePadding = 12.dp) {
                reactions.forEachIndexed { i, r ->
                    Tab(selected = i == selected, onClick = { selected = i },
                        text = { Text("${r.emoji} ${r.count}", fontSize = 15.sp) })
                }
            }
            val ids = reactions.getOrNull(selected)?.userIds.orEmpty()
            val loaded = profiles
            if (loaded == null) {
                Box(Modifier.fillMaxWidth().padding(28.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = palette.accent)
                }
            } else LazyColumn(Modifier.fillMaxWidth().heightIn(max = 380.dp)) {
                items(ids, key = { it }) { id ->
                    val p = loaded[id]
                    Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically) {
                        AvatarImage(url = p?.avatarUrl, name = p?.name ?: "?", size = 34.dp)
                        Spacer(Modifier.width(12.dp))
                        Column {
                            Text(p?.name ?: "Someone", color = palette.textPrimary, fontSize = 15.sp)
                            p?.username?.let { Text("@$it", color = palette.textMuted, fontSize = 12.sp) }
                        }
                    }
                }
            }
        }
    }
}
