package com.wsgpolar.disband.ui

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
fun AppRoot(app: AppState) {
    DisbandTheme {
        val palette = LocalPalette.current
        val phase by app.phase.collectAsState()
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
                AuthPhase.SignedIn -> MainScreen(app)
            }
        }
    }
}

@Composable
fun <T> StateFlow<T>.collectAsStateValue() = collectAsState()