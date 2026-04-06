package atolla.native.android

import android.util.Log
import com.snap.modules.atolla.TrackPlaybackNativeModule
import com.snap.modules.atolla.TrackPlaybackNativeModuleFactory
import com.snap.valdi.modules.RegisterValdiModule
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

@RegisterValdiModule
class AtollaTrackPlaybackNativeModuleFactory : TrackPlaybackNativeModuleFactory() {
		override fun onLoadModule(): TrackPlaybackNativeModule {
		return object : TrackPlaybackNativeModule {
			override fun cacheAtollaTrackFromUrl(trackId: String, url: String): String {
				return AtollaTrackPlaybackNativeCache.cacheTrackFromUrl(trackId, url)
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
			deleteExistingTrackFiles(cacheDir, safeKey)
			val bytes = connection.getInputStream().use { it.readBytes() }
			if (bytes.isEmpty()) {
				Log.e(tag, "Track download returned empty bytes trackId=$trackId")
				return ""
			}
			file.writeBytes(bytes)
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
