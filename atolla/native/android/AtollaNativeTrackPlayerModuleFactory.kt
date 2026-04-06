package atolla.native.android

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.snap.modules.atolla.NativeTrackPlayerModule
import com.snap.modules.atolla.NativeTrackPlayerModuleFactory
import com.snap.valdi.modules.RegisterValdiModule

@RegisterValdiModule
class AtollaNativeTrackPlayerModuleFactory : NativeTrackPlayerModuleFactory() {
	override fun onLoadModule(): NativeTrackPlayerModule {
		return object : NativeTrackPlayerModule {
			override fun setAtollaNativeTrackPlayerSource(sourceUrl: String) {
				AtollaNativeTrackPlayer.setSource(sourceUrl)
			}

			override fun setAtollaNativeTrackPlayerPlaying(isPlaying: Boolean) {
				AtollaNativeTrackPlayer.setPlaying(isPlaying)
			}

			override fun seekAtollaNativeTrackPlayerTo(seconds: Double) {
				AtollaNativeTrackPlayer.seekToSeconds(seconds)
			}

			override fun getAtollaNativeTrackPlayerPositionSeconds(): Double {
				return AtollaNativeTrackPlayer.getPositionSeconds()
			}

			override fun getAtollaNativeTrackPlayerDurationSeconds(): Double {
				return AtollaNativeTrackPlayer.getDurationSeconds()
			}

			override fun getAtollaNativeTrackPlayerState(): String {
				return AtollaNativeTrackPlayer.getState()
			}

			override fun getAtollaNativeTrackPlayerLastError(): String {
				return AtollaNativeTrackPlayer.getLastError()
			}

			override fun resetAtollaNativeTrackPlayer() {
				AtollaNativeTrackPlayer.reset()
			}
		}
	}
}

object AtollaNativeTrackPlayer {
	private const val tag = "AtollaNativeTrackPlayer"
	private const val notificationChannelId = "atolla_media_playback"
	private const val notificationChannelName = "Media playback"
	private const val notificationId = 4001
	private const val actionPlay = "com.tx3stn.atolla.action.PLAY"
	private const val actionPause = "com.tx3stn.atolla.action.PAUSE"
	private const val actionStop = "com.tx3stn.atolla.action.STOP"

	@Volatile private var mediaPlayer: MediaPlayer? = null
	@Volatile private var mediaSession: MediaSession? = null
	@Volatile private var notificationManager: NotificationManager? = null
	@Volatile private var state: String = "idle"
	@Volatile private var lastError: String = ""
	@Volatile private var currentSource: String = ""
	@Volatile private var desiredPlaying: Boolean = false

	@Synchronized
	fun setSource(sourceUrl: String) {
		val trimmed = sourceUrl.trim()
		if (trimmed.isEmpty()) {
			reset()
			return
		}

		if (trimmed == currentSource && mediaPlayer != null) {
			return
		}

		releasePlayer()
		lastError = ""
		currentSource = trimmed
		state = "preparing"

		try {
			val context = resolveApplicationContext()
			if (context != null) {
				ensureMediaInfrastructure(context)
			}
			val player = MediaPlayer()
			player.setAudioAttributes(
				AudioAttributes.Builder()
					.setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
					.setUsage(AudioAttributes.USAGE_MEDIA)
					.build(),
			)

			player.setOnPreparedListener {
				if (desiredPlaying) {
					try {
						player.start()
						state = "playing"
						updateMediaState(player.currentPosition)
						showOrUpdateNotification()
					} catch (error: Throwable) {
						lastError = error.message ?: "start failed"
						state = "error"
						updateMediaState(0)
						showOrUpdateNotification()
					}
				} else {
					state = "prepared"
					updateMediaState(0)
					showOrUpdateNotification()
				}

				updateMediaMetadata()
			}

			player.setOnCompletionListener {
				state = "completed"
				desiredPlaying = false
				updateMediaState(player.currentPosition)
				showOrUpdateNotification()
			}

			player.setOnErrorListener { _, what, extra ->
				lastError = "MediaPlayer error what=$what extra=$extra"
				state = "error"
				updateMediaState(0)
				showOrUpdateNotification()
				true
			}

			if (context != null) {
				player.setDataSource(context, Uri.parse(trimmed))
			} else {
				player.setDataSource(trimmed)
			}

			player.prepareAsync()
			mediaPlayer = player
			updateMediaState(0)
			showOrUpdateNotification()
		} catch (error: Throwable) {
			lastError = error.message ?: "setSource failed"
			state = "error"
			Log.e(tag, "Failed setting source", error)
			updateMediaState(0)
			showOrUpdateNotification()
			releasePlayer()
		}
	}

	@Synchronized
	fun setPlaying(isPlaying: Boolean) {
		desiredPlaying = isPlaying

		val player = mediaPlayer ?: return
		if (state == "preparing" || state == "idle") {
			return
		}

		try {
			if (isPlaying) {
				if (!player.isPlaying) {
					if (state == "completed") {
						player.seekTo(0)
					}
					player.start()
				}
				state = "playing"
			} else {
				if (player.isPlaying) {
					player.pause()
				}
				state = "paused"
			}
			updateMediaState(player.currentPosition)
			showOrUpdateNotification()
		} catch (error: Throwable) {
			lastError = error.message ?: "setPlaying failed"
			state = "error"
			updateMediaState(0)
			showOrUpdateNotification()
		}
	}

	@Synchronized
	fun seekToSeconds(seconds: Double) {
		val player = mediaPlayer ?: return
		if (seconds < 0) return
		try {
			player.seekTo((seconds * 1000.0).toInt())
			updateMediaState(player.currentPosition)
		} catch (error: Throwable) {
			lastError = error.message ?: "seek failed"
			state = "error"
			updateMediaState(0)
			showOrUpdateNotification()
		}
	}

	fun getPositionSeconds(): Double {
		val player = mediaPlayer ?: return 0.0
		return try {
			player.currentPosition.toDouble() / 1000.0
		} catch (_: Throwable) {
			0.0
		}
	}

	fun getDurationSeconds(): Double {
		val player = mediaPlayer ?: return 0.0
		return try {
			val duration = player.duration
			if (duration <= 0) 0.0 else duration.toDouble() / 1000.0
		} catch (_: Throwable) {
			0.0
		}
	}

	fun getState(): String = state

	fun getLastError(): String = lastError

	@Synchronized
	fun reset() {
		lastError = ""
		state = "idle"
		currentSource = ""
		desiredPlaying = false
		cancelNotification()
		releaseMediaSession()
		releasePlayer()
	}

	@Synchronized
	fun onNotificationAction(action: String?) {
		when (action) {
			actionPlay -> setPlaying(true)
			actionPause -> setPlaying(false)
			actionStop -> reset()
		}
	}

	@Synchronized
	private fun releasePlayer() {
		val player = mediaPlayer
		mediaPlayer = null
		if (player != null) {
			try {
				player.stop()
			} catch (_: Throwable) {
				// ignored
			}
			try {
				player.release()
			} catch (_: Throwable) {
				// ignored
			}
		}
	}

	private fun resolveApplicationContext(): android.content.Context? {
		return try {
			val activityThreadClass = Class.forName("android.app.ActivityThread")
			val currentApplication = activityThreadClass.getMethod("currentApplication").invoke(null)
			currentApplication as? android.app.Application
		} catch (_: Throwable) {
			null
		}
	}

	@Synchronized
	private fun ensureMediaInfrastructure(context: Context) {
		if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) {
			return
		}

		try {
			if (notificationManager == null) {
				notificationManager =
					context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
			}

			if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
				val manager = notificationManager
				if (manager != null && manager.getNotificationChannel(notificationChannelId) == null) {
					val channel = NotificationChannel(
						notificationChannelId,
						notificationChannelName,
						NotificationManager.IMPORTANCE_LOW,
					)
					manager.createNotificationChannel(channel)
				}
			}

			ensureMediaSessionInitializedOnMainThread(context)
		} catch (error: Throwable) {
			Log.e(tag, "Failed media infrastructure setup", error)
		}
	}

	@Synchronized
	private fun ensureMediaSessionInitializedOnMainThread(context: Context) {
		if (mediaSession != null) {
			return
		}

		val mainLooper = Looper.getMainLooper()
		if (mainLooper == null) {
			Log.e(tag, "Main looper unavailable for media session init")
			return
		}

		if (Looper.myLooper() == mainLooper) {
			createMediaSession(context)
			return
		}

		Handler(mainLooper).post {
			try {
				synchronized(this) {
					if (mediaSession == null) {
						createMediaSession(context)
					}
				}
			} catch (error: Throwable) {
				Log.e(tag, "Failed posting media session init", error)
			}
		}
	}

	private fun createMediaSession(context: Context) {
		val session = MediaSession(context, tag)
		session.setCallback(
			object : MediaSession.Callback() {
				override fun onPlay() {
					setPlaying(true)
				}

				override fun onPause() {
					setPlaying(false)
				}

				override fun onSeekTo(pos: Long) {
					seekToSeconds(pos.toDouble() / 1000.0)
				}

				override fun onStop() {
					reset()
				}
			},
		)
		session.isActive = true
		mediaSession = session
	}

	private fun updateMediaState(positionMs: Int) {
		if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) {
			return
		}

		val session = mediaSession ?: return

		try {
			val playbackState =
				when (state) {
					"playing" -> PlaybackState.STATE_PLAYING
					"paused" -> PlaybackState.STATE_PAUSED
					"completed" -> PlaybackState.STATE_STOPPED
					"preparing" -> PlaybackState.STATE_BUFFERING
					"prepared" -> PlaybackState.STATE_PAUSED
					"error" -> PlaybackState.STATE_ERROR
					else -> PlaybackState.STATE_NONE
				}

			val speed = if (playbackState == PlaybackState.STATE_PLAYING) 1.0f else 0.0f
			val actions =
				(
					PlaybackState.ACTION_PLAY or
						PlaybackState.ACTION_PAUSE or
						PlaybackState.ACTION_PLAY_PAUSE or
						PlaybackState.ACTION_STOP or
						PlaybackState.ACTION_SEEK_TO
					)

			val builder = PlaybackState.Builder()
				.setActions(actions)
				.setState(playbackState, positionMs.toLong().coerceAtLeast(0), speed)

			session.setPlaybackState(builder.build())
		} catch (error: Throwable) {
			Log.e(tag, "Failed updating media state", error)
		}
	}

	private fun updateMediaMetadata() {
		if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) {
			return
		}

		val session = mediaSession ?: return

		try {
			val player = mediaPlayer
			val duration = try {
				val value = player?.duration ?: 0
				if (value > 0) value.toLong() else 0L
			} catch (_: Throwable) {
				0L
			}

			val title = Uri.parse(currentSource).lastPathSegment ?: "Track"
			val metadata =
				android.media.MediaMetadata.Builder()
					.putString(android.media.MediaMetadata.METADATA_KEY_TITLE, title)
					.putString(android.media.MediaMetadata.METADATA_KEY_ARTIST, "Atolla")
					.putLong(android.media.MediaMetadata.METADATA_KEY_DURATION, duration)
					.build()

			session.setMetadata(metadata)
		} catch (error: Throwable) {
			Log.e(tag, "Failed updating media metadata", error)
		}
	}

	private fun showOrUpdateNotification() {
		if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) {
			return
		}

		try {
			val context = resolveApplicationContext() ?: return
			ensureMediaInfrastructure(context)
			val manager = notificationManager ?: return
			val session = mediaSession ?: return

			val isPlayingNow = state == "playing"
			val title = Uri.parse(currentSource).lastPathSegment ?: "Track"
			val contentIntent =
				context.packageManager.getLaunchIntentForPackage(context.packageName)?.let { launchIntent ->
					PendingIntent.getActivity(
						context,
						10,
						launchIntent,
						pendingIntentFlags(),
					)
				}

			val playPauseAction =
				if (isPlayingNow) {
					Notification.Action.Builder(
						android.R.drawable.ic_media_pause,
						"Pause",
						actionPendingIntent(context, actionPause, 1),
					).build()
				} else {
					Notification.Action.Builder(
						android.R.drawable.ic_media_play,
						"Play",
						actionPendingIntent(context, actionPlay, 2),
					).build()
				}

			val stopAction =
				Notification.Action.Builder(
					android.R.drawable.ic_menu_close_clear_cancel,
					"Stop",
					actionPendingIntent(context, actionStop, 3),
				).build()

			val builder =
				Notification.Builder(context)
					.setSmallIcon(android.R.drawable.ic_media_play)
					.setContentTitle(title)
					.setContentText(if (isPlayingNow) "Playing" else "Paused")
					.setOnlyAlertOnce(true)
					.setOngoing(isPlayingNow)
					.setVisibility(Notification.VISIBILITY_PUBLIC)
					.setStyle(
						Notification.MediaStyle()
							.setMediaSession(session.sessionToken)
							.setShowActionsInCompactView(0),
					)
					.addAction(playPauseAction)
					.addAction(stopAction)

			if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
				builder.setChannelId(notificationChannelId)
			}

			if (contentIntent != null) {
				builder.setContentIntent(contentIntent)
			}

			manager.notify(notificationId, builder.build())
		} catch (error: Throwable) {
			Log.e(tag, "Failed posting media notification", error)
		}
	}

	private fun cancelNotification() {
		try {
			notificationManager?.cancel(notificationId)
		} catch (_: Throwable) {
			// ignored
		}
	}

	private fun releaseMediaSession() {
		if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) {
			return
		}

		val session = mediaSession
		mediaSession = null
		if (session != null) {
			try {
				session.isActive = false
				session.release()
			} catch (_: Throwable) {
				// ignored
			}
		}
	}

	private fun actionPendingIntent(context: Context, action: String, requestCode: Int): PendingIntent {
		val intent = Intent(context, AtollaNativeTrackPlayerActionReceiver::class.java).setAction(action)
		return PendingIntent.getBroadcast(context, requestCode, intent, pendingIntentFlags())
	}

	private fun pendingIntentFlags(): Int {
		val mutableFlag = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
		return PendingIntent.FLAG_UPDATE_CURRENT or mutableFlag
	}
}

class AtollaNativeTrackPlayerActionReceiver : BroadcastReceiver() {
	override fun onReceive(context: Context?, intent: Intent?) {
		AtollaNativeTrackPlayer.onNotificationAction(intent?.action)
	}
}
