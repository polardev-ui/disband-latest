package com.wsgpolar.disband.ui

import android.app.Activity
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import com.wsgpolar.disband.core.DisbandTheme
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.state.AuthPhase
import com.wsgpolar.disband.state.AppState
import com.wsgpolar.disband.ui.auth.AuthScreen
import com.wsgpolar.disband.ui.auth.MfaScreen
import com.wsgpolar.disband.ui.main.MainScreen
import kotlinx.coroutines.flow.StateFlow

@Composable
fun AppRoot(
    app: AppState,
    pendingNav: StateFlow<com.wsgpolar.disband.ui.main.PendingNav?>? = null,
    onPendingNavConsumed: () -> Unit = {},
) {
    DisbandTheme {
        val palette = LocalPalette.current
        SystemBarsFollowPalette(palette.isDark)
        val phase by app.phase.collectAsState()
        val nav by (pendingNav?.collectAsState() ?: androidx.compose.runtime.remember { kotlinx.coroutines.flow.MutableStateFlow(null) }.collectAsState())
        Box(
            Modifier
                .fillMaxSize()
                .background(palette.background),
        ) {
            when (phase) {
                AuthPhase.Loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = palette.accent)
                }
                AuthPhase.SignedOut -> AuthScreen(app)
                AuthPhase.MfaRequired -> MfaScreen(app)
                AuthPhase.SignedIn -> MainScreen(app, pendingNav = nav, onPendingNavConsumed = onPendingNavConsumed)
            }
        }
    }
}

/**
 * Light or dark status- and navigation-bar icons to match the app's theme.
 * `enableEdgeToEdge()` takes them from the phone's own light/dark setting, so
 * a phone in light mode drew dark icons over the dark app and the clock all
 * but vanished.
 */
@Composable
private fun SystemBarsFollowPalette(isDark: Boolean) {
    val view = LocalView.current
    if (view.isInEditMode) return
    SideEffect {
        val window = (view.context as? Activity)?.window ?: return@SideEffect
        WindowCompat.getInsetsController(window, view).apply {
            isAppearanceLightStatusBars = !isDark
            isAppearanceLightNavigationBars = !isDark
        }
    }
}

@Composable
fun <T> StateFlow<T>.collectAsStateValue() = collectAsState()