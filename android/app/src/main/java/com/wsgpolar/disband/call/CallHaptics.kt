package com.wsgpolar.disband.call

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/** Incoming-call vibration, mirroring the iOS `CallHaptics` (every 2.2s ring burst). */
object CallHaptics {
    private var pulseJob: Job? = null

    fun startRingVibration(context: Context, scope: CoroutineScope) {
        stopVibration()
        pulseOnce(context)
        pulseJob = scope.launch {
            while (isActive) {
                delay(2_200)
                if (isActive) pulseOnce(context)
            }
        }
    }

    fun stopVibration() {
        pulseJob?.cancel()
        pulseJob = null
    }

    fun pulse(context: Context) {
        pulseOnce(context)
    }

    private fun pulseOnce(context: Context) {
        runCatching {
            val vibrator = vibrator(context)
            if (!vibrator.hasVibrator()) return
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createOneShot(600, VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION")
                vibrator.vibrate(600)
            }
        }
    }

    private fun vibrator(context: Context): Vibrator =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            context.getSystemService(VibratorManager::class.java).defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }
}