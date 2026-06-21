package atolla.native.android

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder

// foreground service that anchors media playback during screen-off/background. Android kills
// processes that post a media notification without a foreground service, so this holds the
// foreground notification to keep the process (and the streaming player) alive.
// ensureStartedWithNotification starts or updates it when a notification is built;
// stopIfRunning removes it cleanly when playback stops
class AtollaPlaybackService : Service() {
    companion object {
        private const val NOTIFICATION_ID = 4002
        private const val NOTIFICATION_CHANNEL_ID = "atolla_track_playback"

        // written before startForegroundService so onStartCommand always finds it
        @Volatile private var pendingNotification: Notification? = null

        @Volatile var instance: AtollaPlaybackService? = null
            private set

        // if already running, update its foreground notification; otherwise start the service,
        // which calls startForeground in onStartCommand
        fun ensureStartedWithNotification(context: Context, notification: Notification) {
            pendingNotification = notification
            val running = instance
            if (running != null) {
                running.updateForeground(notification)
                return
            }
            val intent = Intent(context, AtollaPlaybackService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                @Suppress("DEPRECATION")
                context.startService(intent)
            }
        }

        fun stopIfRunning() {
            instance?.shutdown()
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        instance = this
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notification = pendingNotification
        if (notification == null) {
            // pendingNotification is only null when the OS restarts this service via
            // START_STICKY after the process was killed. no active playback to resume, so stop
            // immediately. Android 8+ requires startForeground() in onStartCommand before
            // stopSelf() even when stopping right away, else ForegroundServiceDidNotStartInTimeException
            startForeground(NOTIFICATION_ID, buildPlaceholderNotification())
            stopSelf(startId)
            return START_NOT_STICKY
        }
        startForeground(NOTIFICATION_ID, notification)
        return START_STICKY
    }

    private fun buildPlaceholderNotification(): Notification {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            if (manager?.getNotificationChannel(NOTIFICATION_CHANNEL_ID) == null) {
                val channel = NotificationChannel(
                    NOTIFICATION_CHANNEL_ID,
                    "Playback",
                    NotificationManager.IMPORTANCE_LOW
                )
                channel.setShowBadge(false)
                manager?.createNotificationChannel(channel)
            }
            return Notification.Builder(this, NOTIFICATION_CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setContentTitle("")
                .build()
        }
        @Suppress("DEPRECATION")
        return Notification.Builder(this)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle("")
            .build()
    }

    fun updateForeground(notification: Notification) {
        startForeground(NOTIFICATION_ID, notification)
    }

    fun shutdown() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
        stopSelf()
    }

    override fun onDestroy() {
        super.onDestroy()
        if (instance === this) {
            instance = null
        }
    }

}
