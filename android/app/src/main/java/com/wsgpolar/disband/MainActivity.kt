package com.wsgpolar.disband

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.wsgpolar.disband.core.AppConfig
import com.wsgpolar.disband.ui.AppRoot
import com.wsgpolar.disband.ui.main.PendingNav
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class MainActivity : ComponentActivity() {
    companion object {
        private val _pendingNav = MutableStateFlow<PendingNav?>(null)
        val pendingNav: StateFlow<PendingNav?> = _pendingNav.asStateFlow()

        internal fun postPending(nav: PendingNav) {
            if (!nav.isBlank) _pendingNav.value = nav
        }

        fun consumePending() {
            _pendingNav.value = null
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        handleIntent(intent)
        val container = (application as DisbandApp).container
        setContent {
            AppRoot(container.appState, pendingNav = pendingNav, onPendingNavConsumed = { consumePending() })
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        if (intent == null) return
        // 1) Deep link URI (https://www.disband.dev/server/CODE or disband://invite/CODE)
        intent.dataString?.let { uri ->
            AppConfig.INVITE_REGEX.find(uri)?.groupValues?.getOrNull(1)?.takeIf { it.isNotBlank() }?.let { _ ->
                // Invite resolution needs a server fetch; MainScreen will show the sheet
                // via the thread/channel routing — stash the raw code as threadId prefix.
                // The sheet observes pendingNav and fetches the preview.
                postPending(PendingNav(threadId = "invite:$uri"))
                return
            }
            // Generic source navigation from push data that arrived as a VIEW intent
            val source = intent.getStringExtra("source")
            if (!source.isNullOrBlank()) {
                postPending(PendingNav(source = source))
                return
            }
        }
        // 2) Extras placed by MessagingService (call push or message push)
        val callId = intent.getStringExtra("callId")
        if (callId != null) {
            // Call handling is done via AppState.calls — just bring the app to foreground;
            // the incoming call UI is driven by CallManager's incoming flow.
            return
        }
        val source = intent.getStringExtra("source")
        if (!source.isNullOrBlank()) {
            postPending(PendingNav(source = source))
            return
        }
        // 3) Single "source" extra without URI (standard message push)
        intent.getStringExtra("source")?.takeIf { it.isNotBlank() }?.let { src ->
            postPending(PendingNav(source = src))
        }
    }
}