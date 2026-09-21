package com.wsgpolar.disband.ui.main

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.foundation.layout.offset
import androidx.compose.ui.Modifier
import com.wsgpolar.disband.data.Server

enum class Destination {
    Home, Friends, Notes, You,
}

class ShellChromeState {
    var currentDestination by mutableStateOf(Destination.Home)
    var dockVisible by mutableStateOf(true)
    var selectedServerId by mutableStateOf<String?>(null)
    var selectedChannelId by mutableStateOf<String?>(null)

    fun hideDock() {
        dockVisible = false
    }

    fun showDock() {
        dockVisible = true
    }

    fun navigateTo(destination: Destination, serverId: String? = null, channelId: String? = null) {
        currentDestination = destination
        selectedServerId = serverId
        selectedChannelId = channelId
    }

    fun isChannelActive(serverId: String, channelId: String): Boolean {
        return selectedServerId == serverId && selectedChannelId == channelId
    }
}

fun Modifier.hidesDock(state: ShellChromeState): Modifier {
    return this.then(
        Modifier.offset {
            val bottomOffset = if (state.dockVisible) 0f else -40f
            androidx.compose.ui.unit.IntOffset(0, bottomOffset.toInt())
        }
    )
}

@Composable
fun rememberShellChrome(): ShellChromeState {
    return remember { ShellChromeState() }
}