package atolla.native.android

import android.net.Uri
import android.util.Log
import com.snap.valdi.exceptions.ValdiException
import com.snap.valdi.utils.Disposable
import com.snap.valdi.utils.ValdiAssetLoadOutputType
import com.snap.valdi.utils.ValdiImage
import com.snap.valdi.utils.ValdiImageContent
import com.snap.valdi.utils.ValdiImageFactory
import com.snap.valdi.utils.ValdiImageLoadCompletion
import com.snap.valdi.utils.ValdiImageLoadOptions
import com.snap.valdi.utils.ValdiImageLoader
import com.snap.valdi.utils.ValdiImageWithContent
import java.io.File
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap
import kotlin.concurrent.thread

data class AtollaCacheRequestPayload(
	val category: String,
	val sourceUrl: String,
)

class AtollaCacheImageLoader : ValdiImageLoader {
	private val tag = "AtollaCacheLoader"
	private val diskCacheFolder = "atolla-image-cache"
	private val memory = ConcurrentHashMap<String, ByteArray>()
	private val diskCacheDir: File? by lazy {
		val appCacheDir = resolveAppCacheDir() ?: return@lazy null
		val dir = File(appCacheDir, diskCacheFolder)
		try {
			if (!dir.exists()) {
				dir.mkdirs()
			}
			if (!dir.isDirectory) {
				Log.e(tag, "Disk cache path is not a directory: ${dir.absolutePath}")
				return@lazy null
			}
			dir
		} catch (error: Throwable) {
			Log.e(tag, "Failed to initialize disk cache directory", error)
			null
		}
	}

	fun getEntryCount(): Int {
		val diskStats = getDiskStats()
		if (diskStats != null) {
			return diskStats.first
		}
		return memory.size
	}

	fun getTotalBytes(): Long {
		val diskStats = getDiskStats()
		if (diskStats != null) {
			return diskStats.second
		}
		return memory.values.sumOf { it.size.toLong() }
	}

	override fun getSupportedURLSchemes(): List<String> {
		Log.d(tag, "getSupportedURLSchemes")
		return listOf("atolla-cache")
	}

	override fun getSupportedOutputTypes(): Int {
		return ValdiAssetLoadOutputType.BITMAP.value or ValdiAssetLoadOutputType.RAW_CONTENT.value
	}

	@Throws(ValdiException::class)
	override fun getRequestPayload(url: Uri): Any {
		Log.d(tag, "getRequestPayload url=$url")
		val category = url.getQueryParameter("c")
		val source = url.getQueryParameter("u")
		if (url.scheme != "atolla-cache" || url.host != "image" || category.isNullOrBlank() || source.isNullOrBlank()) {
			throw ValdiException("Invalid atolla-cache image URL")
		}
		return AtollaCacheRequestPayload(category = category, sourceUrl = source)
	}

	override fun loadImage(
		requetPayload: Any,
		options: ValdiImageLoadOptions,
		completion: ValdiImageLoadCompletion,
	): Disposable? {
		val payload = requetPayload as AtollaCacheRequestPayload
		val key = "${payload.category}:${payload.sourceUrl}"
		Log.d(tag, "loadImage key=$key outputType=${options.outputType}")

		memory[key]?.let { bytes ->
			Log.d(tag, "cache hit key=$key bytes=${bytes.size}")
			completeFromBytes(bytes, options, completion)
			return null
		}

		readFromDisk(key)?.let { bytes ->
			memory[key] = bytes
			Log.d(tag, "disk cache hit key=$key bytes=${bytes.size}")
			completeFromBytes(bytes, options, completion)
			return null
		}

		val worker = thread(start = true) {
			try {
				val bytes = URL(payload.sourceUrl).readBytes()
				Log.d(tag, "network fetch success key=$key bytes=${bytes.size}")
				memory[key] = bytes
				writeToDisk(key, bytes)
				completeFromBytes(bytes, options, completion)
			} catch (error: Throwable) {
				Log.e(tag, "network fetch failed key=$key", error)
				completion.onImageLoadComplete(0, 0, null, error)
			}
		}

		return object : Disposable {
			override fun dispose() {
				worker.interrupt()
			}
		}
	}

	private fun completeFromBytes(
		bytes: ByteArray,
		options: ValdiImageLoadOptions,
		completion: ValdiImageLoadCompletion,
	) {
		val image: ValdiImage = when (options.outputType) {
			ValdiAssetLoadOutputType.BITMAP -> ValdiImageFactory.fromByteArray(bytes)
			ValdiAssetLoadOutputType.RAW_CONTENT -> ValdiImageWithContent(ValdiImageContent.Bytes(bytes))
			else -> {
				completion.onImageLoadComplete(
					0,
					0,
					null,
					ValdiException("Unsupported output type: ${options.outputType}"),
				)
				return
			}
		}

		completion.onImageLoadComplete(0, 0, image, null)
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

	private fun cacheFileForKey(key: String): File? {
		val dir = diskCacheDir ?: return null
		return File(dir, sha256Hex(key))
	}

	private fun readFromDisk(key: String): ByteArray? {
		val file = cacheFileForKey(key) ?: return null
		if (!file.exists()) {
			return null
		}
		return try {
			file.readBytes()
		} catch (error: Throwable) {
			Log.e(tag, "Failed reading disk cache key=$key", error)
			null
		}
	}

	private fun writeToDisk(key: String, bytes: ByteArray) {
		val file = cacheFileForKey(key) ?: return
		try {
			file.writeBytes(bytes)
		} catch (error: Throwable) {
			Log.e(tag, "Failed writing disk cache key=$key", error)
		}
	}

	private fun sha256Hex(value: String): String {
		val digest = MessageDigest.getInstance("SHA-256")
		return digest.digest(value.toByteArray(Charsets.UTF_8)).joinToString("") { byte ->
			"%02x".format(byte)
		}
	}

	private fun getDiskStats(): Pair<Int, Long>? {
		val dir = diskCacheDir ?: return null
		val files = try {
			dir.listFiles()
		} catch (_: Throwable) {
			null
		} ?: return 0 to 0L

		var count = 0
		var bytes = 0L
		for (file in files) {
			if (!file.isFile) {
				continue
			}
			count += 1
			bytes += file.length()
		}
		return count to bytes
	}
}
