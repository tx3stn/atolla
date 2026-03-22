package atolla.native.android

import android.graphics.BitmapFactory
import android.graphics.Color
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
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import org.json.JSONObject

data class AtollaCacheRequestPayload(
	val cacheOnly: Boolean,
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

	fun extractPalette(category: String, sourceUrl: String): String? {
		val key = "$category:$sourceUrl"
		val bytes = memory[key] ?: readFromDisk(key) ?: return null
		val bitmap = try {
			BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
		} catch (error: Throwable) {
			Log.e(tag, "Failed to decode bitmap for palette key=$key", error)
			null
		} ?: return null

		return try {
			val primary = dominantColorHex(bitmap)
			val surface = mutedVariant(primary)
			val onSurface = legibleTextColor(surface)
			JSONObject()
				.put("primary", JSONObject().put("hex", primary))
				.put("surface", JSONObject().put("hex", surface))
				.put("on_surface", JSONObject().put("hex", onSurface))
				.toString()
		} catch (error: Throwable) {
			Log.e(tag, "Failed to extract palette for key=$key", error)
			null
		} finally {
			bitmap.recycle()
		}
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
		val cacheOnly = url.getQueryParameter("co") == "1"
		val source = url.getQueryParameter("u")
		if (url.scheme != "atolla-cache" || url.host != "image" || category.isNullOrBlank() || source.isNullOrBlank()) {
			throw ValdiException("Invalid atolla-cache image URL")
		}
		return AtollaCacheRequestPayload(cacheOnly = cacheOnly, category = category, sourceUrl = source)
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

		if (payload.cacheOnly) {
			completion.onImageLoadComplete(
				0,
				0,
				null,
				ValdiException("Cache miss for cache-only request"),
			)
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

	private fun dominantColorHex(bitmap: android.graphics.Bitmap): String {
		val width = bitmap.width
		val height = bitmap.height
		if (width <= 0 || height <= 0) {
			return "#d8dee9"
		}

		val step = max(1, max(width, height) / 64)
		val bins = HashMap<Int, Long>()
		val sumsR = HashMap<Int, Long>()
		val sumsG = HashMap<Int, Long>()
		val sumsB = HashMap<Int, Long>()

		var y = 0
		while (y < height) {
			var x = 0
			while (x < width) {
				val color = bitmap.getPixel(x, y)
				val r = Color.red(color)
				val g = Color.green(color)
				val b = Color.blue(color)
				val qr = r ushr 3
				val qg = g ushr 3
				val qb = b ushr 3
				val key = (qr shl 10) or (qg shl 5) or qb
				bins[key] = (bins[key] ?: 0L) + 1
				sumsR[key] = (sumsR[key] ?: 0L) + r.toLong()
				sumsG[key] = (sumsG[key] ?: 0L) + g.toLong()
				sumsB[key] = (sumsB[key] ?: 0L) + b.toLong()
				x += step
			}
			y += step
		}

		if (bins.isEmpty()) {
			return "#d8dee9"
		}

		val sorted = bins.entries.sortedByDescending { it.value }
		for (entry in sorted) {
			val key = entry.key
			val count = entry.value.coerceAtLeast(1L)
			val r = ((sumsR[key] ?: 0L) / count).toInt()
			val g = ((sumsG[key] ?: 0L) / count).toInt()
			val b = ((sumsB[key] ?: 0L) / count).toInt()
			val l = rgbLightness(r, g, b)
			if (l > 0.15) {
				return rgbToHex(r, g, b)
			}
		}

		val top = sorted.first()
		val topCount = top.value.coerceAtLeast(1L)
		val tr = ((sumsR[top.key] ?: 0L) / topCount).toInt()
		val tg = ((sumsG[top.key] ?: 0L) / topCount).toInt()
		val tb = ((sumsB[top.key] ?: 0L) / topCount).toInt()
		return rgbToHex(tr, tg, tb)
	}

	private fun mutedVariant(hex: String): String {
		val (r, g, b) = hexToRgb(hex)
		val (h, s, l) = rgbToHsl(r, g, b)
		val newS = s * 0.5
		val newL = max(0.08, l * 0.8)
		val (nr, ng, nb) = hslToRgb(h, newS, newL)
		return rgbToHex(nr, ng, nb)
	}

	private fun legibleTextColor(hex: String): String {
		val (r, g, b) = hexToRgb(hex)
		val (h, s, l) = rgbToHsl(r, g, b)
		return if (l < 0.5) {
			val textL = min(0.88, l + 0.65)
			val textS = min(s * 1.5, 0.35)
			val (nr, ng, nb) = hslToRgb(h, textS, textL)
			rgbToHex(nr, ng, nb)
		} else {
			val textL = max(0.12, l - 0.6)
			val textS = min(s * 0.8, 0.45)
			val (nr, ng, nb) = hslToRgb(h, textS, textL)
			rgbToHex(nr, ng, nb)
		}
	}

	private fun rgbLightness(r: Int, g: Int, b: Int): Double {
		val rn = r / 255.0
		val gn = g / 255.0
		val bn = b / 255.0
		val maxV = max(rn, max(gn, bn))
		val minV = min(rn, min(gn, bn))
		return (maxV + minV) / 2.0
	}

	private fun hexToRgb(hex: String): Triple<Int, Int, Int> {
		val h = hex.removePrefix("#")
		return Triple(
			h.substring(0, 2).toInt(16),
			h.substring(2, 4).toInt(16),
			h.substring(4, 6).toInt(16),
		)
	}

	private fun rgbToHex(r: Int, g: Int, b: Int): String {
		fun clamped(v: Int): Int = min(255, max(0, v))
		return "#%02x%02x%02x".format(clamped(r), clamped(g), clamped(b))
	}

	private fun rgbToHsl(r: Int, g: Int, b: Int): Triple<Double, Double, Double> {
		val rn = r / 255.0
		val gn = g / 255.0
		val bn = b / 255.0
		val maxV = max(rn, max(gn, bn))
		val minV = min(rn, min(gn, bn))
		val l = (maxV + minV) / 2.0
		if (abs(maxV - minV) < 1e-9) {
			return Triple(0.0, 0.0, l)
		}
		val d = maxV - minV
		val s = if (l > 0.5) d / (2 - maxV - minV) else d / (maxV + minV)
		val h = when (maxV) {
			rn -> ((gn - bn) / d + if (gn < bn) 6 else 0) / 6.0
			gn -> ((bn - rn) / d + 2) / 6.0
			else -> ((rn - gn) / d + 4) / 6.0
		} * 360.0
		return Triple(h, s, l)
	}

	private fun hslToRgb(h: Double, s: Double, l: Double): Triple<Int, Int, Int> {
		if (s == 0.0) {
			val v = (l * 255.0).toInt()
			return Triple(v, v, v)
		}
		val hk = h / 360.0
		val q = if (l < 0.5) l * (1 + s) else l + s - l * s
		val p = 2 * l - q
		fun hue2rgb(pp: Double, qq: Double, tIn: Double): Double {
			var t = tIn
			if (t < 0) t += 1.0
			if (t > 1) t -= 1.0
			if (t < 1.0 / 6.0) return pp + (qq - pp) * 6.0 * t
			if (t < 1.0 / 2.0) return qq
			if (t < 2.0 / 3.0) return pp + (qq - pp) * (2.0 / 3.0 - t) * 6.0
			return pp
		}
		val r = (hue2rgb(p, q, hk + 1.0 / 3.0) * 255.0).toInt()
		val g = (hue2rgb(p, q, hk) * 255.0).toInt()
		val b = (hue2rgb(p, q, hk - 1.0 / 3.0) * 255.0).toInt()
		return Triple(r, g, b)
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
