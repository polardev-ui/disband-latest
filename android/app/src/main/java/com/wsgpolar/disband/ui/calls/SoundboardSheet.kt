package com.wsgpolar.disband.ui.calls

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.data.MessageTools

/** The space's soundboard (`server_sounds`): tap a sound to play it for the call. */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun SoundboardSheet(serverId: String, onPlay: (String) -> Unit, onDismiss: () -> Unit) {
    val palette = LocalPalette.current
    val sounds by produceState<List<MessageTools.Sound>?>(null, serverId) {
        value = runCatching { MessageTools.sounds(serverId) }.getOrDefault(emptyList())
    }
    ModalBottomSheet(onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = palette.surface) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 16.dp).padding(bottom = 20.dp)) {
            Text("Soundboard", color = palette.textPrimary, fontSize = 20.sp, fontWeight = FontWeight.Bold)
            Text("Everyone in the call hears it.", color = palette.textMuted, fontSize = 13.sp)
            val list = sounds
            when {
                list == null -> Box(Modifier.fillMaxWidth().height(120.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = palette.accent)
                }
                list.isEmpty() -> Text("This space has no sounds yet. Add them in Space Settings on the web.",
                    color = palette.textMuted, fontSize = 14.sp, modifier = Modifier.padding(vertical = 24.dp))
                else -> FlowRow(
                    Modifier.padding(top = 14.dp).verticalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    list.forEach { sound ->
                        Column(
                            Modifier.width(100.dp).clip(RoundedCornerShape(14.dp)).background(palette.elevated)
                                .clickable(role = Role.Button, onClickLabel = "Play ${sound.name}") { onPlay(sound.url) }
                                .padding(10.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Text(sound.emoji, fontSize = 24.sp)
                            Text(sound.name, color = palette.textPrimary, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                }
            }
        }
    }
}
