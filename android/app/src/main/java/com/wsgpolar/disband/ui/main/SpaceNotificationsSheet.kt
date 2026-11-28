package com.wsgpolar.disband.ui.main

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wsgpolar.disband.core.Brand
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.core.TimeFormat
import com.wsgpolar.disband.data.MessageTools
import com.wsgpolar.disband.data.Server
import kotlinx.coroutines.launch

/**
 * A space's notification settings, the web's `SpaceNotificationsModal`:
 * all messages, only @mentions or nothing; suppress @everyone and @here;
 * mute for a while or until turned back on. Saved per account with
 * `set_server_notification_settings`, so it applies on every device.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SpaceNotificationsSheet(server: Server, onDismiss: () -> Unit) {
    val palette = LocalPalette.current
    val scope = rememberCoroutineScope()
    var settings by remember { mutableStateOf<MessageTools.NotifySettings?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(server.id) {
        settings = runCatching { MessageTools.notifySettings(server.id) }.getOrDefault(MessageTools.NotifySettings())
    }
    fun save(next: MessageTools.NotifySettings) {
        val previous = settings
        settings = next
        error = null
        scope.launch {
            runCatching { MessageTools.setNotifySettings(server.id, next) }.onFailure {
                settings = previous
                error = "Couldn't save that. Try again."
            }
        }
    }

    ModalBottomSheet(onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = palette.surface) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 20.dp).padding(bottom = 24.dp)) {
            Text("Notifications", color = palette.textPrimary, fontSize = 20.sp, fontWeight = FontWeight.Bold)
            Text(server.name, color = palette.textMuted, fontSize = 13.sp)
            val s = settings ?: return@Column
            Spacer(Modifier.height(16.dp))

            Text("MUTE", color = palette.textMuted, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            if (s.muted) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        if (s.mutedForever) "Muted until you turn it back on"
                        else "Muted until ${TimeFormat.short(s.mutedUntil)}",
                        color = palette.textPrimary, fontSize = 14.sp, modifier = Modifier.weight(1f),
                    )
                    TextButton(onClick = { save(s.copy(mutedUntil = null)) }) { Text("Unmute", color = palette.accent) }
                }
            } else {
                listOf("For 15 minutes" to 15L, "For 1 hour" to 60L, "For 8 hours" to 480L, "For 24 hours" to 1440L,
                    "Until I turn it back on" to null).forEach { (label, minutes) ->
                    Text(label, color = palette.textPrimary, fontSize = 14.sp,
                        modifier = Modifier.fillMaxWidth().clickable(role = Role.Button) {
                            val until = minutes?.let { java.time.Instant.now().plusSeconds(it * 60).toString() } ?: MessageTools.FOREVER
                            save(s.copy(mutedUntil = until))
                        }.padding(vertical = 9.dp))
                }
            }

            Spacer(Modifier.height(14.dp))
            Column(if (s.muted) Modifier.alpha(0.5f) else Modifier) {
                Text("NOTIFY ME ABOUT", color = palette.textMuted, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                listOf("all" to "All messages", "mentions" to "Only @mentions", "nothing" to "Nothing").forEach { (value, label) ->
                    Row(
                        Modifier.fillMaxWidth().clickable(role = Role.RadioButton, enabled = !s.muted) { save(s.copy(level = value)) },
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        RadioButton(selected = s.level == value, onClick = { save(s.copy(level = value)) }, enabled = !s.muted)
                        Text(label, color = palette.textPrimary, fontSize = 15.sp)
                    }
                }
                Spacer(Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Suppress @everyone and @here", color = palette.textPrimary, fontSize = 15.sp)
                        Text("They won't notify you in this space.", color = palette.textMuted, fontSize = 12.sp)
                    }
                    Switch(checked = s.suppressEveryone, enabled = !s.muted && s.level != "nothing",
                        onCheckedChange = { save(s.copy(suppressEveryone = it)) })
                }
            }
            error?.let { Text(it, color = Brand.dnd, fontSize = 13.sp, modifier = Modifier.padding(top = 8.dp)) }
        }
    }
}
