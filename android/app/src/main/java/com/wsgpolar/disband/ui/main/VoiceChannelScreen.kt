package com.wsgpolar.disband.ui.main

import androidx.compose.runtime.Composable
import com.wsgpolar.disband.data.Channel
import com.wsgpolar.disband.state.AppState
import com.wsgpolar.disband.ui.calls.VoiceStageView

/**
 * Voice channel presence view: delegates to VoiceStageView.
 */
@Composable
fun VoiceChannelScreen(app: AppState, channel: Channel, onBack: () -> Unit) {
    VoiceStageView(
        app = app,
        channel = channel,
        onMinimize = onBack,
        onBack = onBack,
    )
}
