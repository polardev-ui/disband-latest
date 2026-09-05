package com.wsgpolar.disband.ui.main

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.data.Server
import com.wsgpolar.disband.state.AppState
import com.wsgpolar.disband.ui.AvatarImage
import com.wsgpolar.disband.ui.collectAsStateValue

@Composable
fun ServersScreen(app: AppState) {
    var selectedId by rememberSaveable { mutableStateOf<String?>(null) }
    val servers by app.servers.collectAsStateValue()
    val loading by app.serversLoading.collectAsStateValue()
    val selected = servers.firstOrNull { it.id == selectedId }
    if (selected != null) {
        ServerDetailScreen(app = app, server = selected, onBack = { selectedId = null })
        return
    }
    ServersScreenContent(
        servers = servers,
        loading = loading,
        onRefresh = { app.loadServers() },
        onOpen = { selectedId = it.id },
    )
}

@Composable
fun ServersScreenContent(
    servers: List<Server>,
    loading: Boolean,
    onRefresh: () -> Unit,
    onOpen: (Server) -> Unit = {},
) {
    val palette = LocalPalette.current
    when {
        loading && servers.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(color = palette.accent)
        }
        servers.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("No servers yet", color = palette.textMuted, fontSize = 15.sp)
        }
        else -> LazyColumn(Modifier.fillMaxSize().background(palette.background)) {
            items(servers, key = { it.id }) { server ->
                ServerRow(server, onOpen = { onOpen(server) })
            }
        }
    }
}

@Composable
private fun ServerRow(server: Server, onOpen: () -> Unit) {
    val palette = LocalPalette.current
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onOpen).padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AvatarImage(url = server.iconUrl, name = server.name, size = 48.dp)
        Column(Modifier.padding(start = 12.dp)) {
            Text(server.name, color = palette.textPrimary, fontSize = 16.sp, maxLines = 1,
                overflow = TextOverflow.Ellipsis)
            server.description?.takeIf { it.isNotBlank() }?.let {
                Text(it, color = palette.textMuted, fontSize = 13.sp, maxLines = 1,
                    overflow = TextOverflow.Ellipsis)
            }
        }
    }
}