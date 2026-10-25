package com.wsgpolar.disband

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.wsgpolar.disband.call.CallForegroundService
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
        // Only a fresh launch owns this intent. On a configuration change
        // Android replays the same intent, which used to reopen the invite
        // sheet or re-run notification navigation. onNewIntent handles any
        // genuinely new tap while the activity is alive.
        if (savedInstanceState == null) handleIntent(intent)
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
        // Answer on the ring notification opens the app; the call screen
        // then answers once the microphone is allowed.
        if (intent.getStringExtra(CallForegroundService.EXTRA_CALL_ACTION) == CallForegroundService.CALL_ACTION_ANSWER) {
            intent.removeExtra(CallForegroundService.EXTRA_CALL_ACTION)
            (application as DisbandApp).container.calls.requestAnswer()
            return
        }
        // 1) Deep link URI (https://www.disband.dev/server/CODE or disband://invite/CODE)
        intent.dataString?.let { uri ->
            AppConfig.INVITE_LINK_REGEX.find(uri)?.groupValues?.getOrNull(1)?.takeIf { it.isNotBlank() }?.let { code ->
                // MainScreen shows a join card for it. This used to be posted
                // as a thread id, which matched no conversation, so an invite
                // link opened the app and did nothing.
                postPending(PendingNav(inviteCode = code))
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