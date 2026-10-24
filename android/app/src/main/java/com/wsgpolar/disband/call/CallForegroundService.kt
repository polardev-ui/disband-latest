package com.wsgpolar.disband.call

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.wsgpolar.disband.MainActivity
import com.wsgpolar.disband.R
import java.lang.ref.WeakReference

/**
 * Keeps a call alive and visible while the app is in the background.
 *
 * A plain `notify()` was not enough on either count. Android freezes a
 * backgrounded process, which drops the WebRTC connection mid-call, and an
 * ordinary notification does not get the call treatment on the lock screen or
 * the status bar — which is why leaving the app looked like the call had
 * simply vanished.
 *
 * The notification is built with [NotificationCompat.CallStyle] so the system
 * renders it the way it renders a phone call, with the right actions.
 *
 * Only a call that is placing or connected runs as a foreground service. A
 * ring is a notification on its own: nothing is recorded until it's answered,
 * and Android 14+ refuses a microphone service started from the background —
 * which a phone woken by a call push always is. Starting one there threw, the
 * service then never reached `startForeground`, and the system killed the app
 * a few seconds later, so a backgrounded phone crashed instead of ringing.
 */
class CallForegroundService : Service() {

    companion object {
        const val CHANNEL_ID = "disband_calls"
        private const val NOTIFICATION_ID = 3001

        private const val EXTRA_TITLE = "title"
        private const val EXTRA_CALLER = "caller"

        const val ACTION_START = "com.wsgpolar.disband.CALL_START"
        const val ACTION_HANGUP = "com.wsgpolar.disband.CALL_HANGUP"
        const val ACTION_DECLINE = "com.wsgpolar.disband.CALL_DECLINE"

        /** Put on the activity intent that the Answer action opens. */
        const val EXTRA_CALL_ACTION = "call_action"
        const val CALL_ACTION_ANSWER = "answer"

        /**
         * The manager driving the current call. The service is constructed by
         * the system and cannot be handed dependencies, so the manager
         * registers itself while it is live. Weak, so a dead manager cannot
         * keep the app's object graph alive.
         */
        private var manager: WeakReference<CallManager>? = null

        /** True once `startForeground` has succeeded, until the service dies. */
        @Volatile
        private var inForeground = false

        fun attach(callManager: CallManager) {
            manager = WeakReference(callManager)
        }

        fun detach(callManager: CallManager) {
            if (manager?.get() === callManager) manager = null
        }

        /** Show (or update) the call notification. */
        fun start(context: Context, title: String, caller: String, incoming: Boolean) {
            val app = context.applicationContext
            // Already in the foreground: updating the notification is enough,
            // and a second start from the background would be refused.
            if (incoming || inForeground || !hasMicrophone(app)) {
                post(app, buildNotification(app, title, caller, incoming))
                return
            }
            val intent = Intent(app, CallForegroundService::class.java).apply {
                action = ACTION_START
                putExtra(EXTRA_TITLE, title)
                putExtra(EXTRA_CALLER, caller)
            }
            runCatching { ContextCompat.startForegroundService(app, intent) }
                .onFailure { post(app, buildNotification(app, title, caller, incoming = false)) }
        }

        fun stop(context: Context) {
            val app = context.applicationContext
            // stopService, not startService(ACTION_STOP): a backgrounded app
            // may not start a service, and the ring was never one anyway.
            inForeground = false
            runCatching { app.stopService(Intent(app, CallForegroundService::class.java)) }
            runCatching { NotificationManagerCompat.from(app).cancel(NOTIFICATION_ID) }
        }

        private fun hasMicrophone(context: Context): Boolean =
            ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
                PackageManager.PERMISSION_GRANTED

        @SuppressLint("MissingPermission")
        private fun post(context: Context, notification: Notification) {
            // Without POST_NOTIFICATIONS on 13+ this is a no-op, not a crash.
            runCatching { NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification) }
        }

        private fun buildNotification(
            context: Context,
            title: String,
            caller: String,
            incoming: Boolean,
        ): Notification {
            ensureChannel(context)

            val open = PendingIntent.getActivity(
                context,
                3001,
                Intent(context, MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
                },
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )

            val builder = NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(caller)
                .setOngoing(true)
                .setAutoCancel(false)
                .setContentIntent(open)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                // The tones are played by CallTones on the voice-call stream; a
                // second sound from the notification would talk over them.
                .setSilent(true)

            val person = Person.Builder().setName(caller).setImportant(true).build()
            if (incoming) {
                // Answer opens the app rather than answering out of sight: the
                // call screen is where the microphone permission is asked for,
                // and where the person expects to land after answering.
                val answer = PendingIntent.getActivity(
                    context,
                    3002,
                    Intent(context, MainActivity::class.java).apply {
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
                        putExtra(EXTRA_CALL_ACTION, CALL_ACTION_ANSWER)
                    },
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                )
                builder.setStyle(
                    NotificationCompat.CallStyle.forIncomingCall(person, action(context, ACTION_DECLINE), answer),
                )
                builder.setFullScreenIntent(open, true)
            } else {
                builder.setStyle(
                    NotificationCompat.CallStyle.forOngoingCall(person, action(context, ACTION_HANGUP)),
                )
                builder.setUsesChronometer(true)
            }
            return builder.build()
        }

        private fun action(context: Context, which: String): PendingIntent = PendingIntent.getService(
            context,
            which.hashCode(),
            Intent(context, CallForegroundService::class.java).apply { action = which },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        private fun ensureChannel(context: Context) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (nm.getNotificationChannel(CHANNEL_ID) != null) return
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Calls", NotificationManager.IMPORTANCE_HIGH).apply {
                    description = "Ongoing and incoming voice calls"
                    // CallTones owns the audio; the channel stays quiet.
                    setSound(null, null)
                },
            )
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_HANGUP -> {
                manager?.get()?.hangUpFromNotification()
                finish()
                return START_NOT_STICKY
            }

            ACTION_DECLINE -> {
                manager?.get()?.declineFromNotification()
                finish()
                return START_NOT_STICKY
            }
        }

        val title = intent?.getStringExtra(EXTRA_TITLE) ?: "Disband call"
        val caller = intent?.getStringExtra(EXTRA_CALLER) ?: "Disband"
        val notification = buildNotification(this, title, caller, incoming = false)

        if (enterForeground(notification)) {
            inForeground = true
            return START_NOT_STICKY
        }
        // Refused (Android 14+ will not give a service started from the
        // background the microphone). Leave the notification up and stop:
        // staying started without reaching the foreground gets the app killed.
        finish(keepNotification = true)
        post(this, notification)
        return START_NOT_STICKY
    }

    /**
     * `startForeground` with the microphone type, falling back on Android 14+
     * to a short service so the start is always honoured — a service started
     * with `startForegroundService` that never calls `startForeground` takes
     * the whole app down.
     */
    private fun enterForeground(notification: Notification): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            return runCatching { startForeground(NOTIFICATION_ID, notification) }.isSuccess
        }
        val typed = runCatching {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
        }
        if (typed.isSuccess) return true
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            runCatching {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SHORT_SERVICE)
            }
        }
        return false
    }

    // A short service (the fallback above) must stop when its time is up.
    @Deprecated("Superseded on API 35 by the two-argument overload")
    override fun onTimeout(startId: Int) = finish(keepNotification = true)

    override fun onTimeout(startId: Int, fgsType: Int) = finish(keepNotification = true)

    override fun onDestroy() {
        inForeground = false
        super.onDestroy()
    }

    /** Leave the foreground and stop, removing the notification unless asked not to. */
    private fun finish(keepNotification: Boolean = false) {
        val how = if (keepNotification) ServiceCompat.STOP_FOREGROUND_DETACH else ServiceCompat.STOP_FOREGROUND_REMOVE
        runCatching { ServiceCompat.stopForeground(this, how) }
        inForeground = false
        stopSelf()
    }
}
