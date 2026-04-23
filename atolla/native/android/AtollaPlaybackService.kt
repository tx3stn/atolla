package atolla.native.android

import android.app.Notification
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder

/**
 * Foreground service that anchors media playback during screen-off / background.
 *
 * Android kills processes that post a media notification without a foreground service.
 * This service holds the foreground notification so the OS keeps the process alive
 * and the MediaPlayer in AtollaTrackValdiVideoPlayer keeps streaming.
 *
 * Lifecycle:
 *  - AtollaTrackPlaybackMediaSession calls [ensureStartedWithNotification] when it builds a
 *    notification; this either starts the service (first call) or updates the existing one.
 *  - AtollaTrackPlaybackMediaSession calls [stopIfRunning] when playback stops so the service
 *    and its notification are removed cleanly.
 */
class AtollaPlaybackService : Service() {
    companion object {
        private const val NOTIFICATION_ID = 4002

        /**
         * Pending notification to show as soon as onStartCommand fires.
         * Written before startForegroundService so onStartCommand always finds it.
         */
        @Volatile private var pendingNotification: Notification? = null

        /** The live service instance, or null when the service is not running. */
        @Volatile var instance: AtollaPlaybackService? = null
            private set

        /**
         * If the service is already running, update its foreground notification immediately.
         * Otherwise start the service; it will call startForeground in onStartCommand.
         */
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

        /** Stop the foreground service and remove its notification. */
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
            // START_STICKY after the process was killed. There is no active playback
            // to resume, so stop immediately rather than show a stale placeholder.
            stopSelf(startId)
            return START_NOT_STICKY
        }
        startForeground(NOTIFICATION_ID, notification)
        return START_STICKY
    }

    /** Replace the foreground notification with an updated one. */
    fun updateForeground(notification: Notification) {
        startForeground(NOTIFICATION_ID, notification)
    }

    /** Remove the foreground notification and stop the service. */
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
