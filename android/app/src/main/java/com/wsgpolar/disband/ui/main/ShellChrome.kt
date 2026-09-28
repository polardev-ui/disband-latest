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

/**
 * A deep link handed to the shell from outside (notification tap, server
 * sheet, ...). Any of the three ids may be null; whatever is set is applied,
 * with Home always the destination, exactly like iOS `ShellRouter.open`.
 */
data class PendingNav(
    val serverId: String? = null,
    val channelId: String? = null,
    val threadId: String? = null,
    /**
     * The raw `source` from a push, before anyone knows what kind of thing it
     * is.
     *
     * Every push carries a bare uuid and nothing saying whether it is a
     * channel, a DM thread or a group. It used to be dropped straight into
     * [threadId], so a channel mention tried to open a DM with a channel id,
     * found nothing, and left you on the home screen — which is what
     * "notifications don't take me anywhere" meant. `resolve_notification_source`
     * works the kind out server-side; this field holds it until that answer
     * comes back.
     */
    val source: String? = null,
) {
    val isBlank: Boolean
        get() = serverId == null && channelId == null && threadId == null && source == null
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

    /** Routes the shell to a pending deep link; safe to call with a blank nav. */
    fun applyPending(nav: PendingNav) {
        if (nav.isBlank) return
        currentDestination = Destination.Home
        selectedServerId = nav.serverId
        selectedChannelId = nav.channelId ?: nav.threadId
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