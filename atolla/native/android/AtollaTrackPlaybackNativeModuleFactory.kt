package atolla.native.android

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.drawable.Icon
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.Process
import android.os.SystemClock
import android.util.Log
import com.snap.modules.atolla.TrackPlaybackNativeModule
import com.snap.modules.atolla.TrackPlaybackNativeModuleFactory
import com.snap.valdi.modules.RegisterValdiModule
import java.io.File
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.atomic.AtomicLong

@RegisterValdiModule
class AtollaTrackPlaybackNativeModuleFactory : TrackPlaybackNativeModuleFactory() {
		override fun onLoadModule(): TrackPlaybackNativeModule {
		return object : TrackPlaybackNativeModule {
			override fun cacheAtollaTrackFromUrl(trackId: String, url: String): String {
				return AtollaTrackPlaybackNativeCache.cacheTrackFromUrl(trackId, url)
			}

			override fun cacheAtollaTrackFromUrlAsync(trackId: String, url: String, onComplete: (String) -> Unit) {
				Thread {
					val result = try {
						AtollaTrackPlaybackNativeCache.cacheTrackFromUrl(trackId, url)
					} catch (error: Throwable) {
						Log.e("AtollaTrackCache", "Async track cache failed trackId=$trackId", error)
						""
					}
					onComplete(result)
				}.also { it.isDaemon = true }.start()
			}

			override fun getAtollaCachedTrackFileUrl(trackId: String): String {
				return AtollaTrackPlaybackNativeCache.getCachedTrackFileUrl(trackId)
			}

			override fun getAtollaTrackCacheEntryCount(): Double {
				return AtollaTrackPlaybackNativeCache.getCacheEntryCount().toDouble()
			}

			override fun clearAtollaTrackCache() {
				AtollaTrackPlaybackNativeCache.clearCache()
			}

			override fun setAtollaTrackCacheMaxTracks(maxTracks: Double) {
				AtollaTrackPlaybackNativeCache.setCacheMaxTracks(maxTracks.toInt())
			}

			override fun cacheAtollaDownloadedTrackFromUrlAsync(trackId: String, url: String, onComplete: (String) -> Unit) {
				Thread {
					val result = try {
						AtollaDownloadedTrackNativeCache.cacheTrackFromUrl(trackId, url)
					} catch (error: Throwable) {
						Log.e("AtollaDownloadedTrackCache", "Async downloaded track cache failed trackId=$trackId", error)
						""
					}
					onComplete(result)
				}.also { it.isDaemon = true }.start()
			}

			override fun getAtollaDownloadedTrackFileUrl(trackId: String): String {
				return AtollaDownloadedTrackNativeCache.getCachedTrackFileUrl(trackId)
			}

			override fun removeAtollaDownloadedTrack(trackId: String) {
				AtollaDownloadedTrackNativeCache.removeTrack(trackId)
			}

			override fun getAtollaDownloadedCacheTotalSizeBytes(): Double {
				return AtollaDownloadedTrackNativeCache.getTotalSizeBytes().toDouble()
			}

			override fun updateAtollaTrackPlaybackNotification(
				trackName: String,
				artistName: String,
				albumName: String,
				artworkUrl: String,
				isPlaying: Boolean,
				positionSeconds: Double,
				durationSeconds: Double,
				hasPrevious: Boolean,
				hasNext: Boolean,
			) {
				AtollaTrackPlaybackMediaSession.updateNotification(
					trackName = trackName,
					artistName = artistName,
					albumName = albumName,
					artworkUrl = artworkUrl,
					isPlaying = isPlaying,
					positionSeconds = positionSeconds,
					durationSeconds = durationSeconds,
					hasPrevious = hasPrevious,
					hasNext = hasNext,
				)
			}

			override fun clearAtollaTrackPlaybackNotification() {
				AtollaTrackPlaybackMediaSession.clearNotification()
			}

			override fun consumeAtollaTrackPlaybackNotificationAction(): String {
				return AtollaTrackPlaybackMediaSession.consumeAction()
			}

			override fun ensureAtollaTrackPlaybackNotificationPermission(): Boolean {
				return AtollaTrackPlaybackMediaSession.ensureNotificationPermission()
			}

			override fun getAtollaDeviceUserScopeKey(): String {
				return try {
					val userId = Process.myUid() / 100000
					"android-user-$userId"
				} catch (_: Throwable) {
					"android-user-unknown"
				}
			}
		}
	}
}

object AtollaTrackPlaybackNativeCache {
	private const val tag = "AtollaTrackCache"
	private const val cacheFolder = "atolla-track-cache"
	private const val defaultMaxTracks = 20

	@Volatile
	private var cacheMaxTracks = defaultMaxTracks

	@Synchronized
	fun cacheTrackFromUrl(trackId: String, url: String): String {
		if (trackId.isBlank() || url.isBlank()) {
			return ""
		}

		val existingFile = resolveExistingTrackFile(trackId)
		if (existingFile != null && existingFile.exists() && existingFile.isFile) {
			touch(existingFile)
			return toFileUrl(existingFile)
		}

		val cacheDir = resolveCacheDir() ?: return ""
		val safeKey = safeTrackKey(trackId)

		return try {
			val connection = (URL(url).openConnection() as HttpURLConnection).apply {
				connectTimeout = 10_000
				readTimeout = 20_000
				instanceFollowRedirects = true
				requestMethod = "GET"
				setRequestProperty("Accept", "audio/*,*/*")
			}
			val status = connection.responseCode
			if (status < 200 || status >= 300) {
				Log.e(tag, "Track download failed trackId=$trackId status=$status")
				return ""
			}

			val mimeType = connection.contentType ?: "application/octet-stream"
			if (!isLikelyAudioMimeType(mimeType)) {
				Log.e(tag, "Track download returned non-audio contentType=$mimeType trackId=$trackId")
				return ""
			}

			val extension = extensionFromMimeType(mimeType)
			val file = File(cacheDir, "$safeKey.$extension")
			val tempFile = File(cacheDir, "$safeKey.tmp")
			deleteExistingTrackFiles(cacheDir, safeKey)
			tempFile.delete()
			val bytesWritten = try {
				connection.getInputStream().use { input ->
					tempFile.outputStream().use { output ->
						input.copyTo(output)
					}
				}
			} catch (error: Throwable) {
				tempFile.delete()
				throw error
			}
			if (bytesWritten == 0L) {
				Log.e(tag, "Track download returned empty bytes trackId=$trackId")
				tempFile.delete()
				return ""
			}
			if (!tempFile.renameTo(file)) {
				tempFile.copyTo(file, overwrite = true)
				tempFile.delete()
			}
			touch(file)
			pruneIfNeeded(cacheDir)
			toFileUrl(file)
		} catch (error: Throwable) {
			Log.e(tag, "Failed to cache track trackId=$trackId", error)
			""
		}
	}

	@Synchronized
	fun getCachedTrackFileUrl(trackId: String): String {
		if (trackId.isBlank()) {
			return ""
		}

		val file = resolveExistingTrackFile(trackId) ?: return ""
		if (!file.exists() || !file.isFile) {
			return ""
		}

		touch(file)

		return toFileUrl(file)
	}

	@Synchronized
	fun getCacheEntryCount(): Int {
		val dir = resolveCacheDir() ?: return 0
		val files = try {
			dir.listFiles()
		} catch (_: Throwable) {
			null
		} ?: return 0

		return files.count { it.isFile }
	}

	@Synchronized
	fun clearCache() {
		val dir = resolveCacheDir() ?: return
		val files = try {
			dir.listFiles()
		} catch (_: Throwable) {
			null
		} ?: return

		for (file in files) {
			if (!file.isFile) {
				continue
			}
			try {
				file.delete()
			} catch (_: Throwable) {
				// best effort
			}
		}
	}

	@Synchronized
	fun setCacheMaxTracks(maxTracks: Int) {
		if (maxTracks <= 0) {
			return
		}

		cacheMaxTracks = maxTracks
		val dir = resolveCacheDir() ?: return
		pruneIfNeeded(dir)
	}

	private fun resolveExistingTrackFile(trackId: String): File? {
		val dir = resolveCacheDir() ?: return null
		val key = safeTrackKey(trackId)
		val matches = try {
			dir.listFiles { file -> file.isFile && file.name.startsWith("$key.") }
		} catch (_: Throwable) {
			null
		} ?: return null

		return matches.firstOrNull()
	}

	private fun deleteExistingTrackFiles(cacheDir: File, key: String) {
		val matches = try {
			cacheDir.listFiles { file -> file.isFile && file.name.startsWith("$key.") }
		} catch (_: Throwable) {
			null
		} ?: return

		for (file in matches) {
			try {
				file.delete()
			} catch (_: Throwable) {
				// best effort cleanup
			}
		}
	}

	private fun resolveCacheDir(): File? {
		val appCacheDir = resolveAppCacheDir() ?: return null
		val dir = File(appCacheDir, cacheFolder)
		return try {
			if (!dir.exists()) {
				dir.mkdirs()
			}
			if (!dir.isDirectory) {
				Log.e(tag, "Track cache path is not a directory: ${dir.absolutePath}")
				return null
			}
			dir
		} catch (error: Throwable) {
			Log.e(tag, "Failed to initialize track cache directory", error)
			null
		}
	}

	private fun resolveAppCacheDir(): File? {
		return try {
			val activityThreadClass = Class.forName("android.app.ActivityThread")
			val currentApplication = activityThreadClass.getMethod("currentApplication").invoke(null)
			val app = currentApplication as? android.app.Application ?: return null
			app.cacheDir
		} catch (error: Throwable) {
			Log.e(tag, "Unable to resolve application cache directory", error)
			null
		}
	}

	private fun extensionFromMimeType(mimeType: String): String {
		val normalized = mimeType.lowercase()
		return when {
			normalized.contains("aac") -> "aac"
			normalized.contains("flac") -> "flac"
			normalized.contains("ogg") -> "ogg"
			normalized.contains("wav") -> "wav"
			normalized.contains("m4a") || normalized.contains("mp4") -> "m4a"
			else -> "mp3"
		}
	}

	private fun isLikelyAudioMimeType(mimeType: String): Boolean {
		val normalized = mimeType.lowercase()
		if (normalized.startsWith("audio/")) {
			return true
		}

		return normalized.contains("octet-stream")
	}

	private fun safeTrackKey(trackId: String): String {
		val trimmed = trackId.trim()
		if (trimmed.isEmpty()) {
			return "track"
		}

		return trimmed.replace(Regex("[^a-zA-Z0-9._-]"), "_")
	}

	private fun toFileUrl(file: File): String {
		return "file://${file.absolutePath}"
	}

	private fun pruneIfNeeded(cacheDir: File) {
		val maxTracks = cacheMaxTracks
		if (maxTracks <= 0) {
			return
		}

		val files = try {
			cacheDir.listFiles()
		} catch (_: Throwable) {
			null
		} ?: return

		val trackFiles = files.filter { it.isFile }
		if (trackFiles.size <= maxTracks) {
			return
		}

		val byLru = trackFiles.sortedWith(
			compareBy<File> { it.lastModified() }
				.thenBy { it.name },
		)

		val filesToDelete = byLru.take(trackFiles.size - maxTracks)
		var deleted = 0
		for (file in filesToDelete) {
			try {
				if (file.delete()) {
					deleted += 1
				}
			} catch (_: Throwable) {
				// best effort cleanup
			}
		}

		if (deleted > 0) {
			Log.d(tag, "Pruned $deleted tracks from cache (max=$maxTracks)")
		}
	}

	private fun touch(file: File) {
		try {
			file.setLastModified(System.currentTimeMillis())
		} catch (_: Throwable) {
			// best effort only
		}
	}

}

object AtollaDownloadedTrackNativeCache {
	private const val tag = "AtollaDownloadedTrackCache"
	private const val cacheFolder = "atolla-downloaded-track-cache"

	@Synchronized
	fun cacheTrackFromUrl(trackId: String, url: String): String {
		if (trackId.isBlank() || url.isBlank()) {
			return ""
		}

		val existingFile = resolveExistingTrackFile(trackId)
		if (existingFile != null && existingFile.exists() && existingFile.isFile) {
			touch(existingFile)
			return toFileUrl(existingFile)
		}

		val cacheDir = resolveCacheDir() ?: return ""
		val safeKey = safeTrackKey(trackId)

		return try {
			val connection = (URL(url).openConnection() as HttpURLConnection).apply {
				connectTimeout = 10_000
				readTimeout = 20_000
				instanceFollowRedirects = true
				requestMethod = "GET"
				setRequestProperty("Accept", "audio/*,*/*")
			}
			val status = connection.responseCode
			if (status < 200 || status >= 300) {
				Log.e(tag, "Track download failed trackId=$trackId status=$status")
				return ""
			}

			val mimeType = connection.contentType ?: "application/octet-stream"
			if (!isLikelyAudioMimeType(mimeType)) {
				Log.e(tag, "Track download returned non-audio contentType=$mimeType trackId=$trackId")
				return ""
			}

			val extension = extensionFromMimeType(mimeType)
			val file = File(cacheDir, "$safeKey.$extension")
			val tempFile = File(cacheDir, "$safeKey.tmp")
			deleteExistingTrackFiles(cacheDir, safeKey)
			tempFile.delete()
			val bytesWritten = try {
				connection.getInputStream().use { input ->
					tempFile.outputStream().use { output ->
						input.copyTo(output)
					}
				}
			} catch (error: Throwable) {
				tempFile.delete()
				throw error
			}
			if (bytesWritten == 0L) {
				Log.e(tag, "Track download returned empty bytes trackId=$trackId")
				tempFile.delete()
				return ""
			}
			if (!tempFile.renameTo(file)) {
				tempFile.copyTo(file, overwrite = true)
				tempFile.delete()
			}
			touch(file)
			toFileUrl(file)
		} catch (error: Throwable) {
			Log.e(tag, "Failed to cache downloaded track trackId=$trackId", error)
			""
		}
	}

	@Synchronized
	fun getCachedTrackFileUrl(trackId: String): String {
		if (trackId.isBlank()) {
			return ""
		}

		val file = resolveExistingTrackFile(trackId) ?: return ""
		if (!file.exists() || !file.isFile) {
			return ""
		}

		touch(file)

		return toFileUrl(file)
	}

	@Synchronized
	fun getTotalSizeBytes(): Long {
		val dir = resolveCacheDir() ?: return 0L
		return try {
			dir.listFiles()?.filter { it.isFile }?.sumOf { it.length() } ?: 0L
		} catch (_: Throwable) {
			0L
		}
	}

	@Synchronized
	fun removeTrack(trackId: String) {
		if (trackId.isBlank()) {
			return
		}

		val cacheDir = resolveCacheDir() ?: return
		val safeKey = safeTrackKey(trackId)
		deleteExistingTrackFiles(cacheDir, safeKey)
	}

	private fun resolveExistingTrackFile(trackId: String): File? {
		val dir = resolveCacheDir() ?: return null
		val key = safeTrackKey(trackId)
		val matches = try {
			dir.listFiles { file -> file.isFile && file.name.startsWith("$key.") }
		} catch (_: Throwable) {
			null
		} ?: return null

		return matches.firstOrNull()
	}

	private fun deleteExistingTrackFiles(cacheDir: File, key: String) {
		val matches = try {
			cacheDir.listFiles { file -> file.isFile && file.name.startsWith("$key.") }
		} catch (_: Throwable) {
			null
		} ?: return

		for (file in matches) {
			try {
				file.delete()
			} catch (_: Throwable) {
				// best effort cleanup
			}
		}
	}

	private fun resolveCacheDir(): File? {
		val appFilesDir = resolveAppFilesDir() ?: return null
		val dir = File(appFilesDir, cacheFolder)
		return try {
			if (!dir.exists()) {
				dir.mkdirs()
			}
			if (!dir.isDirectory) {
				Log.e(tag, "Downloaded track cache path is not a directory: ${dir.absolutePath}")
				return null
			}
			dir
		} catch (error: Throwable) {
			Log.e(tag, "Failed to initialize downloaded track cache directory", error)
			null
		}
	}

	private fun resolveAppFilesDir(): File? {
		return try {
			val activityThreadClass = Class.forName("android.app.ActivityThread")
			val currentApplication = activityThreadClass.getMethod("currentApplication").invoke(null)
			val app = currentApplication as? android.app.Application ?: return null
			app.filesDir
		} catch (error: Throwable) {
			Log.e(tag, "Unable to resolve application files directory", error)
			null
		}
	}

	private fun extensionFromMimeType(mimeType: String): String {
		val normalized = mimeType.lowercase()
		return when {
			normalized.contains("aac") -> "aac"
			normalized.contains("flac") -> "flac"
			normalized.contains("ogg") -> "ogg"
			normalized.contains("wav") -> "wav"
			normalized.contains("m4a") || normalized.contains("mp4") -> "m4a"
			else -> "mp3"
		}
	}

	private fun isLikelyAudioMimeType(mimeType: String): Boolean {
		val normalized = mimeType.lowercase()
		if (normalized.startsWith("audio/")) {
			return true
		}

		return normalized.contains("octet-stream")
	}

	private fun safeTrackKey(trackId: String): String {
		val trimmed = trackId.trim()
		if (trimmed.isEmpty()) {
			return "track"
		}

		return trimmed.replace(Regex("[^a-zA-Z0-9._-]"), "_")
	}

	private fun toFileUrl(file: File): String {
		return "file://${file.absolutePath}"
	}

	private fun touch(file: File) {
		try {
			file.setLastModified(System.currentTimeMillis())
		} catch (_: Throwable) {
			// best effort only
		}
	}
}

object AtollaTrackPlaybackMediaSession {
	private const val tag = "AtollaTrackPlaybackMedia"
	private const val notificationChannelId = "atolla_track_playback"
	private const val notificationChannelName = "Track playback"
	private const val notificationId = 4002
	private const val actionPlay = "com.tx3stn.atolla.action.TRACK_PLAY"
	private const val actionPause = "com.tx3stn.atolla.action.TRACK_PAUSE"
	private const val actionPrevious = "com.tx3stn.atolla.action.TRACK_PREVIOUS"
	private const val actionNext = "com.tx3stn.atolla.action.TRACK_NEXT"
	private const val actionStop = "com.tx3stn.atolla.action.TRACK_STOP"

	@Volatile private var mediaSession: MediaSession? = null
	@Volatile private var notificationManager: NotificationManager? = null
	@Volatile private var pendingAction: String = ""
	@Volatile private var activeTrackName: String = ""
	@Volatile private var activeArtistName: String = ""
	@Volatile private var activeAlbumName: String = ""
	@Volatile private var activeArtworkUrl: String = ""
	@Volatile private var activeIsPlaying: Boolean = false
	@Volatile private var activePositionMs: Long = 0L
	@Volatile private var activeDurationMs: Long = 0L
	@Volatile private var activeHasPrevious: Boolean = false
	@Volatile private var activeHasNext: Boolean = false
	@Volatile private var currentArtworkBitmap: Bitmap? = null
	@Volatile private var isArtworkLoadInFlight: Boolean = false
	@Volatile private var lastArtworkLoadAttemptMs: Long = 0L

	private val artworkRequestCounter = AtomicLong(0)
	private const val artworkRetryIntervalMs = 3_000L

	@Synchronized
	fun updateNotification(
		trackName: String,
		artistName: String,
		albumName: String,
		artworkUrl: String,
		isPlaying: Boolean,
		positionSeconds: Double,
		durationSeconds: Double,
		hasPrevious: Boolean,
		hasNext: Boolean,
	) {
		val context = resolveApplicationContext() ?: return
		if (!ensureNotificationPermission()) {
			return
		}
		ensureMediaInfrastructure(context)

		activeTrackName = trackName.trim()
		activeArtistName = artistName.trim()
		activeAlbumName = albumName.trim()
		activeIsPlaying = isPlaying
		activePositionMs = (positionSeconds * 1000.0).toLong().coerceAtLeast(0L)
		activeDurationMs = (durationSeconds * 1000.0).toLong().coerceAtLeast(0L)
		activeHasPrevious = hasPrevious
		activeHasNext = hasNext

		val normalizedArtworkUrl = resolveNotificationArtworkUrl(artworkUrl.trim())
		val artworkChanged = normalizedArtworkUrl != activeArtworkUrl
		if (artworkChanged) {
			activeArtworkUrl = normalizedArtworkUrl
			isArtworkLoadInFlight = false
			if (normalizedArtworkUrl.isBlank()) {
				currentArtworkBitmap = null
			}
		}

		val shouldRetryArtworkLoad =
			!artworkChanged &&
			normalizedArtworkUrl.isNotBlank() &&
			currentArtworkBitmap == null &&
			!isArtworkLoadInFlight &&
			(SystemClock.elapsedRealtime() - lastArtworkLoadAttemptMs) >= artworkRetryIntervalMs

		if ((artworkChanged && normalizedArtworkUrl.isNotBlank()) || shouldRetryArtworkLoad) {
			loadArtworkAsync(normalizedArtworkUrl)
		}

		publishNotificationSnapshot(context)
	}

	@Synchronized
	fun ensureNotificationPermission(): Boolean {
		if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
			return true
		}

		val context = resolveApplicationContext() ?: return false
		val permissionGranted =
			context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) ==
				android.content.pm.PackageManager.PERMISSION_GRANTED
		if (permissionGranted) {
			return true
		}

		val activity = resolveForegroundActivity() ?: return false
		return try {
			activity.requestPermissions(
				arrayOf(android.Manifest.permission.POST_NOTIFICATIONS),
				12041,
			)
			false
		} catch (error: Throwable) {
			Log.e(tag, "Failed requesting notification permission", error)
			false
		}
	}

	@Synchronized
	fun clearNotification() {
		activeTrackName = ""
		activeArtistName = ""
		activeAlbumName = ""
		activeArtworkUrl = ""
		activeIsPlaying = false
		activePositionMs = 0L
		activeDurationMs = 0L
		activeHasPrevious = false
		activeHasNext = false
		currentArtworkBitmap = null
		cancelNotification()
		releaseMediaSession()
	}

	@Synchronized
	fun consumeAction(): String {
		val action = pendingAction
		pendingAction = ""
		return action
	}

	@Synchronized
	fun onAction(action: String?) {
		pendingAction =
			when (action) {
				actionPlay -> "play"
				actionPause -> "pause"
				actionPrevious -> "previous"
				actionNext -> "next"
				actionStop -> "stop"
				else -> ""
			}
	}

	private fun resolveApplicationContext(): Context? {
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
		if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) {
			return
		}

		val session = MediaSession(context, tag)
		session.setCallback(
			object : MediaSession.Callback() {
				override fun onPlay() {
					onAction(actionPlay)
				}

				override fun onPause() {
					onAction(actionPause)
				}

				override fun onSkipToPrevious() {
					onAction(actionPrevious)
				}

				override fun onSkipToNext() {
					onAction(actionNext)
				}

				override fun onStop() {
					onAction(actionStop)
				}

				override fun onSeekTo(pos: Long) {
				// Atolla app currently handles seek from its own UI.
			}
			},
		)
		session.isActive = true
		mediaSession = session
	}

	private fun updateMediaState() {
		if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) {
			return
		}

		val session = mediaSession ?: return

		try {
			val playbackState =
				if (activeIsPlaying) {
					PlaybackState.STATE_PLAYING
				} else {
					PlaybackState.STATE_PAUSED
				}

			var actions =
				(
					PlaybackState.ACTION_PLAY or
						PlaybackState.ACTION_PAUSE or
						PlaybackState.ACTION_PLAY_PAUSE or
						PlaybackState.ACTION_STOP
					)

			if (activeHasPrevious) {
				actions = actions or PlaybackState.ACTION_SKIP_TO_PREVIOUS
			}

			if (activeHasNext) {
				actions = actions or PlaybackState.ACTION_SKIP_TO_NEXT
			}

			val speed = if (activeIsPlaying) 1.0f else 0.0f
			val builder = PlaybackState.Builder()
				.setActions(actions)
				.setState(playbackState, activePositionMs, speed)

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
			val title = activeTrackName.ifBlank { "Track" }
			val artist = activeArtistName.ifBlank { "Atolla" }
			val album = activeAlbumName.ifBlank { "" }

			val builder = android.media.MediaMetadata.Builder()
				.putString(android.media.MediaMetadata.METADATA_KEY_TITLE, title)
				.putString(android.media.MediaMetadata.METADATA_KEY_ARTIST, artist)
				.putString(android.media.MediaMetadata.METADATA_KEY_ALBUM, album)
				.putLong(android.media.MediaMetadata.METADATA_KEY_DURATION, activeDurationMs)

			currentArtworkBitmap?.let { bitmap ->
				builder.putBitmap(android.media.MediaMetadata.METADATA_KEY_ALBUM_ART, bitmap)
				builder.putBitmap(android.media.MediaMetadata.METADATA_KEY_ART, bitmap)
				builder.putBitmap(android.media.MediaMetadata.METADATA_KEY_DISPLAY_ICON, bitmap)
			}

			session.setMetadata(builder.build())
		} catch (error: Throwable) {
			Log.e(tag, "Failed updating media metadata", error)
		}
	}

	private fun publishNotificationSnapshot(context: Context? = null) {
		runOnMainThread {
			synchronized(this) {
				val resolvedContext = context ?: resolveApplicationContext() ?: return@synchronized
				updateMediaState()
				updateMediaMetadata()
				showOrUpdateNotification(resolvedContext)
			}
		}
	}

	private fun runOnMainThread(block: () -> Unit) {
		val mainLooper = Looper.getMainLooper() ?: return
		if (Looper.myLooper() == mainLooper) {
			block()
			return
		}

		Handler(mainLooper).post {
			try {
				block()
			} catch (error: Throwable) {
				Log.e(tag, "Failed running media update on main thread", error)
			}
		}
	}

	private fun showOrUpdateNotification(context: Context) {
		if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) {
			return
		}

		if (!ensureNotificationPermission()) {
			return
		}

		try {
			val manager = notificationManager ?: return
			val session = mediaSession ?: return

			val contentIntent =
				context.packageManager.getLaunchIntentForPackage(context.packageName)?.let { launchIntent ->
					PendingIntent.getActivity(
						context,
						10,
						launchIntent,
						pendingIntentFlags(),
					)
				}

			val actions = mutableListOf<Notification.Action>()
			val compactIndices = mutableListOf<Int>()

			if (activeHasPrevious) {
				actions +=
					buildNotificationAction(
						context,
						android.R.drawable.ic_media_previous,
						"Previous",
						actionPendingIntent(context, actionPrevious, 21),
					)
				compactIndices += actions.lastIndex
			}

			actions +=
				if (activeIsPlaying) {
					buildNotificationAction(
						context,
						android.R.drawable.ic_media_pause,
						"Pause",
						actionPendingIntent(context, actionPause, 22),
					)
				} else {
					buildNotificationAction(
						context,
						android.R.drawable.ic_media_play,
						"Play",
						actionPendingIntent(context, actionPlay, 23),
					)
				}
			compactIndices += actions.lastIndex

			if (activeHasNext) {
				actions +=
					buildNotificationAction(
						context,
						android.R.drawable.ic_media_next,
						"Next",
						actionPendingIntent(context, actionNext, 24),
					)
				compactIndices += actions.lastIndex
			}

			actions +=
				buildNotificationAction(
					context,
					android.R.drawable.ic_menu_close_clear_cancel,
					"Stop",
					actionPendingIntent(context, actionStop, 25),
				)

			val style = Notification.MediaStyle().setMediaSession(session.sessionToken)
			if (compactIndices.isNotEmpty()) {
				style.setShowActionsInCompactView(*compactIndices.toIntArray())
			}

			val title = activeTrackName.ifBlank { "Atolla" }
			val subtitle = when {
				activeArtistName.isNotBlank() -> activeArtistName
				activeAlbumName.isNotBlank() -> activeAlbumName
				else -> ""
			}

			val notificationResId = context.resources.getIdentifier("ic_notification", "drawable", context.packageName)
			val smallIcon = if (notificationResId != 0) notificationResId else android.R.drawable.ic_media_play

			val builder =
				buildNotificationBuilder(context)
					.setSmallIcon(smallIcon)
					.setContentTitle(title)
					.setContentText(if (subtitle.isNotBlank()) subtitle else if (activeIsPlaying) "Playing" else "Paused")
					.setOnlyAlertOnce(true)
					.setOngoing(activeIsPlaying)
					.setVisibility(Notification.VISIBILITY_PUBLIC)
					.setStyle(style)

			for (action in actions) {
				builder.addAction(action)
			}

			if (contentIntent != null) {
				builder.setContentIntent(contentIntent)
			}

			currentArtworkBitmap?.let { bitmap ->
				builder.setLargeIcon(bitmap)
			}

			val notification = builder.build()
			// Route through the foreground service so Android keeps the process
			// alive when the screen is locked. manager.notify() alone is not
			// sufficient — the OS will kill the process under background pressure.
			AtollaPlaybackService.ensureStartedWithNotification(context, notification)
		} catch (error: Throwable) {
			Log.e(tag, "Failed posting media notification", error)
		}
	}

	private fun actionPendingIntent(context: Context, action: String, requestCode: Int): PendingIntent {
		val intent = Intent(context, AtollaTrackPlaybackActionReceiver::class.java).setAction(action)
		return PendingIntent.getBroadcast(context, requestCode, intent, pendingIntentFlags())
	}

	private fun buildNotificationBuilder(context: Context): Notification.Builder {
		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
			return Notification.Builder(context, notificationChannelId)
		}

		@Suppress("DEPRECATION")
		return Notification.Builder(context)
	}

	private fun buildNotificationAction(
		context: Context,
		iconResource: Int,
		title: String,
		pendingIntent: PendingIntent,
	): Notification.Action {
		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
			return Notification.Action.Builder(
				Icon.createWithResource(context, iconResource),
				title,
				pendingIntent,
			).build()
		}

		@Suppress("DEPRECATION")
		return Notification.Action.Builder(iconResource, title, pendingIntent).build()
	}

	private fun pendingIntentFlags(): Int {
		val mutableFlag = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
		return PendingIntent.FLAG_UPDATE_CURRENT or mutableFlag
	}

	private fun cancelNotification() {
		try {
			// Stopping the service removes the foreground notification automatically.
			AtollaPlaybackService.stopIfRunning()
		} catch (_: Throwable) {
			// ignored
		}
		try {
			// Fallback: cancel via NotificationManager in case the service never started.
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

	private fun loadArtworkAsync(artworkUrl: String) {
		if (artworkUrl.isBlank()) {
			return
		}

		isArtworkLoadInFlight = true
		lastArtworkLoadAttemptMs = SystemClock.elapsedRealtime()
		val requestId = artworkRequestCounter.incrementAndGet()
		Thread {
			val bitmap = decodeArtworkBitmap(artworkUrl)
			synchronized(this) {
				if (requestId == artworkRequestCounter.get()) {
					isArtworkLoadInFlight = false
				}
				if (requestId != artworkRequestCounter.get() || artworkUrl != activeArtworkUrl) {
					return@synchronized
				}
				currentArtworkBitmap = bitmap
			}
			publishNotificationSnapshot()
		}.start()
	}

	private fun decodeArtworkBitmap(artworkUrl: String): Bitmap? {
		return try {
			val uri = Uri.parse(artworkUrl)
			if (uri.scheme == "file") {
				val file = File(uri.path ?: "")
				if (!file.exists() || !file.isFile) {
					return null
				}
				return decodeBitmapBytesWithSampling(file.readBytes())
			}

			val connection = (URL(artworkUrl).openConnection() as HttpURLConnection).apply {
				connectTimeout = 10_000
				readTimeout = 20_000
				instanceFollowRedirects = true
				requestMethod = "GET"
				setRequestProperty("Accept", "image/*,*/*")
			}

			val status = connection.responseCode
			if (status < 200 || status >= 300) {
				return null
			}

			val bytes = connection.inputStream.use { stream ->
				val out = ByteArrayOutputStream()
				val buffer = ByteArray(16 * 1024)
				while (true) {
					val read = stream.read(buffer)
					if (read <= 0) {
						break
					}
					out.write(buffer, 0, read)
				}
				out.toByteArray()
			}

			decodeBitmapBytesWithSampling(bytes)
		} catch (_: Throwable) {
			null
		}
	}

	private fun resolveNotificationArtworkUrl(artworkUrl: String): String {
		if (artworkUrl.isBlank()) {
			return ""
		}

		return try {
			AtollaImageLoaderAutoBootstrap.registerForAllRuntimes()
			AtollaCacheImageLoader.sharedInstance
				?.resolveCachedFileUrl("album_art", artworkUrl)
				?: artworkUrl
		} catch (_: Throwable) {
			artworkUrl
		}
	}

	private fun decodeBitmapBytesWithSampling(bytes: ByteArray): Bitmap? {
		if (bytes.isEmpty()) {
			return null
		}

		val boundsOptions = BitmapFactory.Options().apply {
			inJustDecodeBounds = true
		}
		BitmapFactory.decodeByteArray(bytes, 0, bytes.size, boundsOptions)

		if (boundsOptions.outWidth <= 0 || boundsOptions.outHeight <= 0) {
			return null
		}

		var sampleSize = 1
		val targetMaxDimension = 1024
		while (boundsOptions.outWidth / sampleSize > targetMaxDimension || boundsOptions.outHeight / sampleSize > targetMaxDimension) {
			sampleSize *= 2
		}

		val decodeOptions = BitmapFactory.Options().apply {
			inSampleSize = sampleSize.coerceAtLeast(1)
			inPreferredConfig = Bitmap.Config.ARGB_8888
		}

		return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, decodeOptions)
	}

	private fun resolveForegroundActivity(): Activity? {
		return try {
			val activityThreadClass = Class.forName("android.app.ActivityThread")
			val currentActivityThread = activityThreadClass.getMethod("currentActivityThread").invoke(null)
			val activitiesField = activityThreadClass.getDeclaredField("mActivities")
			activitiesField.isAccessible = true
			val activities = activitiesField.get(currentActivityThread) as? Map<*, *> ?: return null

			for (entry in activities.values) {
				val activityRecord = entry ?: continue
				val activityRecordClass = activityRecord.javaClass
				val pausedField = activityRecordClass.getDeclaredField("paused")
				pausedField.isAccessible = true
				val isPaused = pausedField.getBoolean(activityRecord)
				if (isPaused) {
					continue
				}

				val activityField = activityRecordClass.getDeclaredField("activity")
				activityField.isAccessible = true
				val activity = activityField.get(activityRecord) as? Activity
				if (activity != null) {
					return activity
				}
			}

			null
		} catch (_: Throwable) {
			null
		}
	}
}

class AtollaTrackPlaybackActionReceiver : BroadcastReceiver() {
	override fun onReceive(context: Context?, intent: Intent?) {
		AtollaTrackPlaybackMediaSession.onAction(intent?.action)
	}
}
