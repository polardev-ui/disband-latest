package com.wsgpolar.disband.ui.calls

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.core.content.ContextCompat
import androidx.compose.ui.platform.LocalContext

/**
 * Returns a trigger that ensures RECORD_AUDIO is granted before running
 * [onGranted], or runs [onDenied] if it's refused. Re-requests if the user
 * denied mid-session.
 */
@Composable
fun rememberAudioPermissionTrigger(onDenied: () -> Unit = {}, onGranted: () -> Unit): () -> Unit {
    val context = LocalContext.current.applicationContext
    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (granted) onGranted() else onDenied()
    }
    return {
        val granted = ContextCompat.checkSelfPermission(
            context, Manifest.permission.RECORD_AUDIO,
        ) == PackageManager.PERMISSION_GRANTED
        if (granted) onGranted() else launcher.launch(Manifest.permission.RECORD_AUDIO)
    }
}