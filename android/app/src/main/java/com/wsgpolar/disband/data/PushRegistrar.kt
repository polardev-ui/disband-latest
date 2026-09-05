package com.wsgpolar.disband.data

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import com.wsgpolar.disband.BuildConfig
import com.wsgpolar.disband.core.DisbandSupabase
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlin.coroutines.resume

/**
 * Registers the FCM token with the backend (mirror of `PushManager` on iOS).
 * The backend uses this to send `push_message` notifications and call signals.
 */
object PushRegistrar {
    @Volatile
    private var registeredToken: String? = null

    /** Lazily boots Firebase with App attributes baked in at build time. */
    fun initialize(context: Context) {
        if (FirebaseApp.getApps(context).isNotEmpty()) return
        val apiKey = BuildConfig.FIREBASE_API_KEY
        val appId = BuildConfig.FIREBASE_APP_ID
        val projectId = BuildConfig.FIREBASE_PROJECT_ID
        val senderId = BuildConfig.FIREBASE_GCM_SENDER_ID
        if (apiKey.isBlank() || appId.isBlank() || projectId.isBlank()) return

        val opts = com.google.firebase.FirebaseOptions.Builder()
            .setApplicationId(appId)
            .setApiKey(apiKey)
            .setProjectId(projectId)
            .setGcmSenderId(senderId)
            .build()
        FirebaseApp.initializeApp(context.applicationContext, opts)
    }

    fun hasPermission(context: Context): Boolean = runCatching {
        ContextCompat.checkSelfPermission(
            context,
            android.Manifest.permission.POST_NOTIFICATIONS,
        ) == PackageManager.PERMISSION_GRANTED
    }.getOrDefault(false)

    suspend fun registerIfAuthorized(context: Context) {
        if (FirebaseApp.getApps(context).isEmpty()) return
        val currentUserId = DisbandSupabase.auth.currentUserOrNull()?.id ?: return
        if (registeredToken != null) return
        try {
            val token = fetchToken()
            Database.registerDeviceToken(token, platform = "android")
            registeredToken = token
        } catch (_: Exception) {
        }
    }

    private suspend fun fetchToken(): String = suspendCancellableCoroutine { cont ->
        val task = FirebaseMessaging.getInstance().token
        task.addOnCompleteListener { t ->
            if (cont.isActive) {
                if (t.isSuccessful && t.result != null) {
                    cont.resume(t.result)
                } else {
                    cont.resume("")
                }
            }
        }
    }
}