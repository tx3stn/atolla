package atolla.native.android

import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
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

	@Volatile private var mediaPlayer: MediaPlayer? = null
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
					} catch (error: Throwable) {
						lastError = error.message ?: "start failed"
						state = "error"
					}
				} else {
					state = "prepared"
				}
			}

			player.setOnCompletionListener {
				state = "completed"
			}

			player.setOnErrorListener { _, what, extra ->
				lastError = "MediaPlayer error what=$what extra=$extra"
				state = "error"
				true
			}

			if (context != null) {
				player.setDataSource(context, Uri.parse(trimmed))
			} else {
				player.setDataSource(trimmed)
			}

			player.prepareAsync()
			mediaPlayer = player
		} catch (error: Throwable) {
			lastError = error.message ?: "setSource failed"
			state = "error"
			Log.e(tag, "Failed setting source", error)
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
		} catch (error: Throwable) {
			lastError = error.message ?: "setPlaying failed"
			state = "error"
		}
	}

	@Synchronized
	fun seekToSeconds(seconds: Double) {
		val player = mediaPlayer ?: return
		if (seconds < 0) return
		try {
			player.seekTo((seconds * 1000.0).toInt())
		} catch (error: Throwable) {
			lastError = error.message ?: "seek failed"
			state = "error"
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
		releasePlayer()
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
}
