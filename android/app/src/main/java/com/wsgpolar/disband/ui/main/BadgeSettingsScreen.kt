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
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.wsgpolar.disband.core.Brand
import com.wsgpolar.disband.data.AwardedBadge
import com.wsgpolar.disband.state.AppState
import com.wsgpolar.disband.ui.components.BadgeIcon
import com.wsgpolar.disband.ui.components.SharedBadges
import kotlinx.coroutines.launch

/**
 * Choose which of your badges show beside your name, as on iOS and the web.
 * Hiding one only takes it off your profile; you keep it.
 */
@Composable
fun BadgeSettingsScreen(app: AppState, onDismiss: () -> Unit) {
    val scope = rememberCoroutineScope()
    val palette = com.wsgpolar.disband.core.LocalPalette.current
    var badges by remember { mutableStateOf<List<Pair<AwardedBadge, Boolean>>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        val uid = app.currentUserId
        if (uid != null) {
            try {
                badges = SharedBadges.ownBadges(uid)
            } catch (e: Exception) {
                error = e.message
            }
        }
        loading = false
    }

    fun set(key: String, visible: Boolean) {
        val uid = app.currentUserId ?: return
        val previous = badges
        badges = badges.map { if (it.first.def.key == key) it.first to visible else it }
        busy = key
        scope.launch {
            try {
                SharedBadges.setVisible(uid, key, visible)
                error = null
            } catch (e: Exception) {
                badges = previous
                error = "Couldn't save that. Try again."
            }
            busy = null
        }
    }

    Dialog(onDismissRequest = onDismiss) {
        Surface(shape = MaterialTheme.shapes.large, tonalElevation = 6.dp) {
            Column(Modifier.fillMaxWidth().padding(16.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text("Badges", fontWeight = FontWeight.Bold, fontSize = 18.sp)
                    IconButton(onClick = onDismiss) { Icon(Icons.Filled.Close, contentDescription = "Close") }
                }
                if (loading) {
                    Box(Modifier.fillMaxWidth().height(120.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                } else {
                    LazyColumn(Modifier.weight(1f, fill = false)) {
                        if (badges.isEmpty() && error == null) {
                            item {
                                Text("You don't have any badges yet.", color = palette.textMuted, modifier = Modifier.padding(12.dp))
                            }
                        }
                        items(badges, key = { it.first.def.key }) { (badge, visible) ->
                            Row(
                                Modifier.fillMaxWidth().padding(vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                BadgeIcon(badge.def.key, size = 28.dp, contentDescription = null)
                                Spacer(Modifier.width(10.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(badge.def.name, fontWeight = FontWeight.SemiBold)
                                    if (badge.def.description.isNotBlank()) {
                                        Text(badge.def.description, fontSize = 12.sp, color = palette.textMuted)
                                    }
                                }
                                Switch(
                                    checked = visible,
                                    enabled = busy != badge.def.key,
                                    onCheckedChange = { set(badge.def.key, it) },
                                )
                            }
                        }
                        if (error != null) {
                            item { Text(error!!, color = Brand.dnd, fontSize = 12.sp) }
                        }
                    }
                    Text("Hidden badges stay yours. Turn them back on whenever you like.",
                        fontSize = 11.sp, color = palette.textMuted)
                }
            }
        }
    }
}
