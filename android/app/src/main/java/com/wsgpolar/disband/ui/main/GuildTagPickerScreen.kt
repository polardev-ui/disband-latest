package com.wsgpolar.disband.ui.main

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.wsgpolar.disband.core.Brand
import com.wsgpolar.disband.data.Database
import com.wsgpolar.disband.data.GuildTagOption
import com.wsgpolar.disband.data.GuildTagStore
import com.wsgpolar.disband.state.AppState
import com.wsgpolar.disband.ui.AvatarImage
import com.wsgpolar.disband.ui.components.GuildTagBadge
import com.wsgpolar.disband.ui.components.GuildTagBadgeSize
import kotlinx.coroutines.launch

@Composable
fun GuildTagPickerScreen(app: AppState, onDismiss: () -> Unit) {
    val scope = rememberCoroutineScope()
    val palette = com.wsgpolar.disband.core.LocalPalette.current
    var options by remember { mutableStateOf<List<GuildTagOption>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf<String?>(null) }

    fun load() {
        scope.launch {
            if (options.isEmpty()) loading = true
            try {
                options = Database.myGuildTagOptions()
                error = null
                val uid = app.currentUserId
                if (uid != null) {
                    val worn = options.firstOrNull { it.equipped }
                    if (worn != null) GuildTagStore.set(worn.guildTag(), uid) else GuildTagStore.clear(uid)
                }
            } catch (e: Exception) {
                error = e.message
            }
            loading = false
        }
    }

    LaunchedEffect(Unit) { load() }

    Dialog(onDismissRequest = onDismiss) {
        Surface(shape = MaterialTheme.shapes.large, tonalElevation = 6.dp) {
            Column(Modifier.fillMaxWidth().padding(16.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text("Guild tag", fontWeight = FontWeight.Bold, fontSize = 18.sp)
                    IconButton(onClick = onDismiss) { Icon(Icons.Filled.Close, contentDescription = "Close") }
                }
                if (loading && options.isEmpty()) {
                    Box(Modifier.fillMaxWidth().height(120.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                } else {
                    LazyColumn(Modifier.weight(1f, fill = false)) {
                        if (options.isEmpty()) {
                            item {
                                Column(Modifier.padding(12.dp)) {
                                    Text("You're not in a space with a guild tag yet.", fontWeight = FontWeight.SemiBold)
                                    Text("Space owners can create one from Space settings → Guild tag once the space reaches Catalyst Level 3. Then anyone in the space can wear it here.", fontSize = 12.sp, color = palette.textMuted)
                                }
                            }
                        } else {
                            items(options, key = { it.serverId }) { option ->
                                Row(
                                    Modifier.fillMaxWidth().padding(vertical = 6.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    AvatarImage(url = option.serverIconUrl, name = option.serverName, size = 38.dp)
                                    Spacer(Modifier.width(8.dp))
                                    Column(Modifier.weight(1f)) {
                                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                            Text(option.serverName, fontWeight = FontWeight.SemiBold)
                                            GuildTagBadge(tag = option.guildTag(), size = GuildTagBadgeSize.Small)
                                        }
                                        Text(if (option.equipped) "Wearing this tag" else "Available to wear",
                                            fontSize = 12.sp, color = if (option.equipped) Color(0xFF23A55A) else palette.textMuted)
                                    }
                                    if (option.equipped) {
                                        OutlinedButton(
                                            enabled = busy == null,
                                            onClick = {
                                                scope.launch {
                                                    busy = "clear"
                                                    try {
                                                        Database.clearGuildTag()
                                                        val uid = app.currentUserId
                                                        if (uid != null) GuildTagStore.clear(uid)
                                                        options = options.map { it.copy(equipped = false) }
                                                        error = null
                                                    } catch (e: Exception) { error = e.message }
                                                    busy = null
                                                }
                                            },
                                        ) { Text(if (busy == "clear") "Removing…" else "Remove") }
                                    } else {
                                        Button(
                                            enabled = busy == null,
                                            onClick = {
                                                scope.launch {
                                                    busy = option.serverId
                                                    try {
                                                        val tag = Database.equipGuildTag(option.serverId)
                                                        val uid = app.currentUserId
                                                        if (uid != null) GuildTagStore.set(tag, uid)
                                                        options = options.map { it.copy(equipped = it.serverId == option.serverId) }
                                                        error = null
                                                    } catch (e: Exception) { error = e.message }
                                                    busy = null
                                                }
                                            },
                                        ) { Text(if (busy == option.serverId) "Wearing…" else "Wear") }
                                    }
                                }
                            }
                        }
                        if (error != null) {
                            item {
                                Column {
                                    Text(error!!, color = Brand.dnd, fontSize = 12.sp)
                                    TextButton(onClick = { load() }) { Text("Try again") }
                                }
                            }
                        }
                    }
                    Text("You can wear one tag at a time. Wearing is always free; spaces need Catalyst Level 3 to create a tag.",
                        fontSize = 11.sp, color = palette.textMuted)
                }
            }
        }
    }
}
