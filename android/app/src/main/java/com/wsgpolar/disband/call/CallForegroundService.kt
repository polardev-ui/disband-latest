package com.wsgpolar.disband.call

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.Person
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
 */
class CallForegroundService : Service() {

    companion object {
        const val CHANNEL_ID = "disband_calls"
        private const val NOTIFICATION_ID = 3001

        private const val EXTRA_TITLE = "title"
        private const val EXTRA_CALLER = "caller"
        private const val EXTRA_INCOMING = "incoming"

        const val ACTION_START = "com.wsgpolar.disband.CALL_START"
        const val ACTION_STOP = "com.wsgpolar.disband.CALL_STOP"
        const val ACTION_HANGUP = "com.wsgpolar.disband.CALL_HANGUP"
        const val ACTION_ANSWER = "com.wsgpolar.disband.CALL_ANSWER"
        const val ACTION_DECLINE = "com.wsgpolar.disband.CALL_DECLINE"

        /**
         * The manager driving the current call. The service is constructed by
         * the system and cannot be handed dependencies, so the manager
         * registers itself while it is live. Weak, so a dead manager cannot
         * keep the app's object graph alive.
         */
        private var manager: WeakReference<CallManager>? = null

        fun attach(callManager: CallManager) {
            manager = WeakReference(callManager)
        }

        fun detach(callManager: CallManager) {
            if (manager?.get() === callManager) manager = null
        }

        /** Show (or update) the ongoing-call notification. */
        fun start(context: Context, title: String, caller: String, incoming: Boolean) {
            val intent = Intent(context, CallForegroundService::class.java).apply {
                action = ACTION_START
                putExtra(EXTRA_TITLE, title)
                putExtra(EXTRA_CALLER, caller)
                putExtra(EXTRA_INCOMING, incoming)
            }
            runCatching {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
            }
        }

        fun stop(context: Context) {
            runCatching {
                context.startService(
                    Intent(context, CallForegroundService::class.java).apply { action = ACTION_STOP },
                )
            }
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopForegroundCompat()
                stopSelf()
                return START_NOT_STICKY
            }

            ACTION_HANGUP, ACTION_DECLINE -> {
                manager?.get()?.hangUpFromNotification()
                stopForegroundCompat()
                stopSelf()
                return START_NOT_STICKY
            }

            ACTION_ANSWER -> {
                manager?.get()?.answerFromNotification()
                // Stay in the foreground: the call is now running.
                return START_STICKY
            }
        }

        val title = intent?.getStringExtra(EXTRA_TITLE) ?: "Disband call"
        val caller = intent?.getStringExtra(EXTRA_CALLER) ?: "Disband"
        val incoming = intent?.getBooleanExtra(EXTRA_INCOMING, false) == true

        val notification = buildNotification(title, caller, incoming)
        runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE,
                )
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
        }.onFailure {
            // A missing microphone permission makes the typed start throw. The
            // call itself is already lost in that case; at least leave a
            // notification rather than crashing the process.
            runCatching {
                val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                nm.notify(NOTIFICATION_ID, notification)
            }
        }
        return START_STICKY
    }

    private fun buildNotification(title: String, caller: String, incoming: Boolean): Notification {
        ensureChannel()

        val open = PendingIntent.getActivity(
            this,
            3001,
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
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
            builder.setStyle(
                NotificationCompat.CallStyle.forIncomingCall(
                    person,
                    action(ACTION_DECLINE),
                    action(ACTION_ANSWER),
                ),
            )
            builder.setFullScreenIntent(open, true)
        } else {
            builder.setStyle(
                NotificationCompat.CallStyle.forOngoingCall(person, action(ACTION_HANGUP)),
            )
            builder.setUsesChronometer(true)
        }
        return builder.build()
    }

    private fun action(which: String): PendingIntent = PendingIntent.getService(
        this,
        which.hashCode(),
        Intent(this, CallForegroundService::class.java).apply { action = which },
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Calls", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Ongoing and incoming voice calls"
                // CallTones owns the audio; the channel stays quiet.
                setSound(null, null)
            },
        )
    }

    private fun stopForegroundCompat() {
        runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_REMOVE)
            } else {
                @Suppress("DEPRECATION")
                stopForeground(true)
            }
        }
    }
}
