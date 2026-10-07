package com.wsgpolar.disband.data

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.wsgpolar.disband.MainActivity
import com.wsgpolar.disband.R
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Receives FCM pushes. Two flavors, mirroring iOS:
 *  - call pushes: `{callId, from, callerName}` data payload → routed to CallManager (in-app ring).
 *  - alert pushes: `{source, ...}` → heads-up notification, suppressed when that chat is on screen.
 */
class MessagingService : FirebaseMessagingService() {

    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data

        val callId = data["callId"]
        if (callId != null) {
            val from = data["from"] ?: return
            val callerName = data["callerName"] ?: "Disband call"
            val calls = CallPushBridge.calls
            if (calls != null) {
                callScope.launch { calls.handleCallPush(callId, from, callerName) }
            } else {
                showCallNotification(callId, from, callerName)
            }
            return
        }

        val source = data["source"]
        if (source != null && ActiveChat.isShowing(source)) return

        val title = data["title"] ?: "Disband"
        val body = data["body"] ?: data["message"] ?: data["content"] ?: "New message"
        showMessageNotification(title, body, source)
    }

    override fun onNewToken(token: String) {
        val prefs = getSharedPreferences("disband_prefs", Context.MODE_PRIVATE)
        prefs.edit().putString("fcm_token", token).apply()
        callScope.launch {
            runCatching {
                Database.registerDeviceToken(token, platform = "android")
            }
        }
    }

    // MARK: - Notifications

    private fun showCallNotification(callId: String, from: String, callerName: String) {
        if (!notificationsAllowed()) return
        val pending = launchIntent(data = mapOf("callId" to callId, "from" to from,
            "callerName" to callerName), channel = CALL_CHANNEL_ID)
        val notification = baseBuilder(CALL_CHANNEL_ID, "Incoming call", callerName, R.mipmap.ic_launcher)
            .setContentIntent(pending)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setFullScreenIntent(pending, true)
            .build()
        notify(2001, notification)
    }

    private fun showMessageNotification(title: String, body: String, source: String?) {
        if (!notificationsAllowed()) return
        val pending = launchIntent(data = mapOfNotNull("source" to source), channel = MESSAGE_CHANNEL_ID)
        val notification = baseBuilder(MESSAGE_CHANNEL_ID, title, body, R.mipmap.ic_launcher)
            .setContentIntent(pending)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .build()
        // Per-conversation ID so each thread stacks separately; same source
        // replaces its own notification, different sources don't clobber.
        val id = (source?.hashCode() ?: title.hashCode()).let { h -> 2002 + Math.floorMod(h, 10_000) }
        notify(id, notification)
    }

    private fun launchIntent(data: Map<String, String>, channel: String): PendingIntent {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
            data.forEach { (k, v) -> putExtra(k, v) }
        }
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        return PendingIntent.getActivity(this, channel.hashCode(), intent, flags)
    }

    private fun baseBuilder(channel: String, title: String, body: String, icon: Int): NotificationCompat.Builder =
        NotificationCompat.Builder(this, channel)
            .setSmallIcon(icon)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            // Sound comes from the channel (custom pop); DEFAULT_SOUND would
            // only matter pre-Oreo and would fight it there.
            .setDefaults(NotificationCompat.DEFAULT_LIGHTS or NotificationCompat.DEFAULT_VIBRATE)

    private fun notify(id: Int, notification: android.app.Notification) {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        ensureChannels(manager)
        if (notificationsAllowed()) {
            runCatching { manager.notify(id, notification) }
        }
    }

    private fun ensureChannels(manager: NotificationManager) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        // Channel sound is frozen at creation: to move existing installs onto
        // the custom pop without orphaning channels, delete once (guarded by
        // a prefs flag) and recreate with the sound attached.
        val prefs = getSharedPreferences("disband_prefs", Context.MODE_PRIVATE)
        if (!prefs.getBoolean("notif_sound_v1", false)) {
            manager.deleteNotificationChannel(CALL_CHANNEL_ID)
            manager.deleteNotificationChannel(MESSAGE_CHANNEL_ID)
            prefs.edit().putBoolean("notif_sound_v1", true).apply()
        }
        val audio = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        val pop = Uri.parse("android.resource://${packageName}/${R.raw.notificationpop}")
        manager.createNotificationChannel(
            NotificationChannel(CALL_CHANNEL_ID, "Calls", NotificationManager.IMPORTANCE_HIGH).apply {
                setSound(pop, audio)
            },
        )
        manager.createNotificationChannel(
            NotificationChannel(MESSAGE_CHANNEL_ID, "Messages", NotificationManager.IMPORTANCE_HIGH).apply {
                setSound(pop, audio)
            },
        )
    }

    private fun notificationsAllowed(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED

    companion object {
        const val CALL_CHANNEL_ID = "disband_calls"
        const val MESSAGE_CHANNEL_ID = "disband_messages"
        val callScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

        fun configure(calls: com.wsgpolar.disband.call.CallManager) {
            CallPushBridge.calls = calls
        }
    }

    private fun mapOfNotNull(vararg pairs: Pair<String, String?>): Map<String, String> =
        pairs.filter { it.second != null }.associate { it.first to it.second!! }
}