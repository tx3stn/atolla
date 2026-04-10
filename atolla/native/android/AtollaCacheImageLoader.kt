package atolla.native.android

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.View
import com.snap.valdi.callable.safePerform
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
import com.snap.valdi.utils.ValdiMarshaller
import com.snap.valdi.utils.ValdiVideoLoader
import com.snap.valdi.utils.ValdiVideoPlayer
import com.snap.valdi.utils.ValdiVideoPlayerCreatedCompletion
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.CompletableFuture
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

data class AtollaTrackVideoRequestPayload(
	val sourceUrl: String,
)

data class QuantizedColorCandidate(
	val b: Int,
	val count: Long,
	val g: Int,
	val r: Int,
)

class AtollaCacheImageLoader : ValdiImageLoader, ValdiVideoLoader {
	companion object {
		private val sharedMemory = ConcurrentHashMap<String, ByteArray>()
		private val inFlight = ConcurrentHashMap<String, CompletableFuture<ByteArray>>()
	}

	private val tag = "AtollaCacheLoader"
	private val diskCacheFolder = "atolla-image-cache"
	private val memory = sharedMemory
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

	fun clearCategories(categories: List<String>) {
		// Always clear blurred art alongside album art.
		val expanded = categories.toMutableSet()
		if (expanded.contains("album_art")) expanded.add("album_art_blurred")
		val prefixes = expanded.map { "$it:" }

		// Clear matching entries from memory.
		val memKeys = memory.keys().toList().filter { k -> prefixes.any { k.startsWith(it) } }
		for (k in memKeys) memory.remove(k)

		// Disk filenames are "${category}_${sha256(key)}", so filter by prefix.
		val dir = diskCacheDir ?: return
		val files = try { dir.listFiles() } catch (_: Throwable) { null } ?: return
		val diskPrefixes = expanded.map { "${it}_" }
		var deleted = 0
		for (file in files) {
			if (file.isFile && diskPrefixes.any { file.name.startsWith(it) } && file.delete()) deleted++
		}
		Log.d(tag, "clearCategories: removed ${memKeys.size} memory entries, deleted $deleted disk files for $expanded")
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
			val (primary, accent) = dominantAndAccentColorHex(bitmap)
			val surface = mutedVariant(primary)
			val onSurface = legibleTextColor(surface)
			val mutedOnSurface = mutedTextColor(onSurface, surface)
			JSONObject()
				.put("accent", JSONObject().put("hex", accent))
				.put("primary", JSONObject().put("hex", primary))
				.put("surface", JSONObject().put("hex", surface))
				.put("on_surface", JSONObject().put("hex", onSurface))
				.put("muted_on_surface", JSONObject().put("hex", mutedOnSurface))
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
		return listOf("atolla-cache", "atolla-track")
	}

	override fun getSupportedOutputTypes(): Int {
		return (
			ValdiAssetLoadOutputType.BITMAP.value or
				ValdiAssetLoadOutputType.RAW_CONTENT.value or
				ValdiAssetLoadOutputType.VIDEO.value
			)
	}

	@Throws(ValdiException::class)
	override fun getRequestPayload(url: Uri): Any {
		Log.d(tag, "getRequestPayload url=$url")
		if (url.scheme == "atolla-track" && url.host == "audio") {
			val source = url.getQueryParameter("u")
			if (source.isNullOrBlank()) {
				throw ValdiException("Invalid atolla-track video URL")
			}
			return AtollaTrackVideoRequestPayload(sourceUrl = source)
		}

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

		// Fast path: native memory hit — synchronous, safe on any thread.
		memory[key]?.let { bytes ->
			Log.d(tag, "cache hit key=$key bytes=${bytes.size}")
			completeFromBytes(bytes, options, completion)
			return null
		}

		// Disk reads and network fetches happen on a background thread so the
		// calling thread (typically the UI thread) is never blocked. Disposing
		// only cancels the completion callback — the download still runs to
		// completion so the result is cached for the next request (e.g. when
		// the same image scrolls back into view).
		val cancelled = java.util.concurrent.atomic.AtomicBoolean(false)

		// Deduplicate concurrent requests for the same key. If a download is
		// already in progress, attach to its CompletableFuture instead of
		// starting another thread. This prevents the "all at once" appearance
		// caused by N grid items each spawning their own background thread.
		val newFuture = CompletableFuture<ByteArray>()
		val existing = inFlight.putIfAbsent(key, newFuture)
		if (existing != null) {
			existing.whenComplete { bytes, error ->
				if (!cancelled.get()) {
					if (bytes != null) completeFromBytes(bytes, options, completion)
					else completion.onImageLoadComplete(0, 0, null, error ?: ValdiException("Download failed"))
				}
			}
			return object : Disposable {
				override fun dispose() { cancelled.set(true) }
			}
		}

		thread(start = true) {
			try {
				// Disk hit: promote to memory and complete.
				readFromDisk(key)?.let { bytes ->
					memory[key] = bytes
					Log.d(tag, "disk cache hit key=$key bytes=${bytes.size}")
					inFlight.remove(key)
					newFuture.complete(bytes)
					if (!cancelled.get()) completeFromBytes(bytes, options, completion)
					return@thread
				}

				// Blurred art: generate from the cached original, fetching from
				// network if the original isn't cached yet.
				if (payload.category == "album_art_blurred") {
					val originalKey = "album_art:${payload.sourceUrl}"
					val cachedOriginal = memory[originalKey] ?: readFromDisk(originalKey)
					if (cachedOriginal != null) {
						val blurredBytes = generateBlurredBytes(cachedOriginal)
						inFlight.remove(key)
						if (blurredBytes != null) {
							memory[key] = blurredBytes
							writeToDisk(key, blurredBytes)
							Log.d(tag, "blur generated from cache key=$key bytes=${blurredBytes.size}")
							newFuture.complete(blurredBytes)
							if (!cancelled.get()) completeFromBytes(blurredBytes, options, completion)
						} else {
							newFuture.completeExceptionally(ValdiException("Blur generation failed"))
							if (!cancelled.get()) completion.onImageLoadComplete(0, 0, null, ValdiException("Blur generation failed"))
						}
						return@thread
					}
					val originalBytes = URL(payload.sourceUrl).readBytes()
					memory[originalKey] = originalBytes
					writeToDisk(originalKey, originalBytes)
					val blurredBytes = generateBlurredBytes(originalBytes)
					inFlight.remove(key)
					if (blurredBytes != null) {
						memory[key] = blurredBytes
						writeToDisk(key, blurredBytes)
						Log.d(tag, "blur generated after fetch key=$key bytes=${blurredBytes.size}")
						newFuture.complete(blurredBytes)
						if (!cancelled.get()) completeFromBytes(blurredBytes, options, completion)
					} else {
						newFuture.completeExceptionally(ValdiException("Blur generation failed after fetch"))
						if (!cancelled.get()) completion.onImageLoadComplete(0, 0, null, ValdiException("Blur generation failed after fetch"))
					}
					return@thread
				}

				if (payload.cacheOnly) {
					inFlight.remove(key)
					val ex = ValdiException("Cache miss for cache-only request")
					newFuture.completeExceptionally(ex)
					if (!cancelled.get()) {
						completion.onImageLoadComplete(0, 0, null, ex)
					}
					return@thread
				}

				val bytes = URL(payload.sourceUrl).readBytes()
				Log.d(tag, "network fetch success key=$key bytes=${bytes.size}")
				memory[key] = bytes
				writeToDisk(key, bytes)
				inFlight.remove(key)
				newFuture.complete(bytes)
				if (!cancelled.get()) completeFromBytes(bytes, options, completion)
			} catch (error: Throwable) {
				Log.e(tag, "load failed key=$key", error)
				inFlight.remove(key)
				newFuture.completeExceptionally(error)
				if (!cancelled.get()) completion.onImageLoadComplete(0, 0, null, error)
			}
		}

		return object : Disposable {
			override fun dispose() {
				cancelled.set(true)
			}
		}
	}

	override fun loadVideo(
		requestPayload: Any,
		completion: ValdiVideoPlayerCreatedCompletion,
	): Disposable? {
		val payload = requestPayload as? AtollaTrackVideoRequestPayload
		if (payload == null) {
			Log.e(tag, "Invalid video payload: ${requestPayload::class.java.name}")
			return null
		}

		val context = resolveApplicationContext()
		if (context == null) {
			Log.e(tag, "Unable to resolve application context for video load")
			return null
		}

		val player = AtollaTrackValdiVideoPlayer(context, payload.sourceUrl)
		completion.onVideoPlayerCreated(player, null)
		return player
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

	private fun resolveApplicationContext(): android.app.Application? {
		return try {
			val activityThreadClass = Class.forName("android.app.ActivityThread")
			val currentApplication = activityThreadClass.getMethod("currentApplication").invoke(null)
			currentApplication as? android.app.Application
		} catch (error: Throwable) {
			Log.e(tag, "Unable to resolve application context", error)
			null
		}
	}

	private fun cacheFileForKey(key: String): File? {
		val dir = diskCacheDir ?: return null
		val category = key.substringBefore(':')
		return File(dir, "${category}_${sha256Hex(key)}")
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

	private fun dominantAndAccentColorHex(bitmap: android.graphics.Bitmap): Pair<String, String> {
		val width = bitmap.width
		val height = bitmap.height
		if (width <= 0 || height <= 0) {
			return "#d8dee9" to "#3b82f6"
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
			return "#d8dee9" to "#3b82f6"
		}

		val sorted = bins.entries.sortedByDescending { it.value }
		val candidates = sorted.map { entry ->
			val key = entry.key
			val count = entry.value.coerceAtLeast(1L)
			QuantizedColorCandidate(
				r = ((sumsR[key] ?: 0L) / count).toInt(),
				g = ((sumsG[key] ?: 0L) / count).toInt(),
				b = ((sumsB[key] ?: 0L) / count).toInt(),
				count = count,
			)
		}

		var bestHex: String? = null
		var bestScore = Double.NEGATIVE_INFINITY
		for (candidate in candidates) {
			val (_, s, l) = rgbToHsl(candidate.r, candidate.g, candidate.b)
			if (l <= 0.15) {
				continue
			}

			val saturationWeight = 0.45 + s * 1.15
			val lightnessWeight = clamp(1.0 - abs(l - 0.55) * 1.7, 0.35, 1.0)
			val neutralPenalty = if (s < 0.12) 0.55 else 1.0
			val score = candidate.count.toDouble() * saturationWeight * lightnessWeight * neutralPenalty
			if (score > bestScore) {
				bestScore = score
				bestHex = enhancePrimaryColor(candidate.r, candidate.g, candidate.b)
			}
		}

		val primaryHex =
			if (bestHex != null) {
				bestHex
			} else {
				var fallbackHex: String? = null
				for (candidate in candidates) {
					if (rgbLightness(candidate.r, candidate.g, candidate.b) > 0.15) {
						fallbackHex = rgbToHex(candidate.r, candidate.g, candidate.b)
						break
					}
				}
				fallbackHex ?: run {
					val top = candidates.first()
					rgbToHex(top.r, top.g, top.b)
				}
			}

		val accentHex = selectAccentColorHex(candidates, primaryHex)
		return primaryHex to accentHex
	}

	private fun selectAccentColorHex(
		candidates: List<QuantizedColorCandidate>,
		primaryHex: String,
	): String {
		if (candidates.isEmpty()) {
			return primaryHex
		}

		val totalPopulation = candidates.sumOf { it.count }
		if (totalPopulation <= 0L) {
			return primaryHex
		}

		val (pr, pg, pb) = hexToRgb(primaryHex)
		val (primaryHue, _, primaryLightness) = rgbToHsl(pr, pg, pb)

		var bestHex: String? = null
		var bestScore = Double.NEGATIVE_INFINITY
		for (candidate in candidates) {
			val (h, s, l) = rgbToHsl(candidate.r, candidate.g, candidate.b)
			if (l <= 0.15 || l >= 0.88) continue
			if (s < 0.2) continue

			val share = candidate.count.toDouble() / totalPopulation.toDouble()
			if (share < 0.01 || share > 0.35) continue

			val hueDistance = normalizedHueDistance(primaryHue, h)
			if (hueDistance < 0.12) continue

			val lightnessDistance = abs(l - primaryLightness)
			val rarityWeight = clamp(1.0 - abs(share - 0.12) / 0.12, 0.0, 1.0)
			val score =
				(hueDistance * 1.4 + lightnessDistance * 0.35) * (0.35 + s) * (0.2 + rarityWeight)
			if (score > bestScore) {
				bestScore = score
				bestHex = enhanceAccentColor(candidate.r, candidate.g, candidate.b)
			}
		}

		return bestHex ?: primaryHex
	}
	private fun mutedVariant(hex: String): String {
		val (r, g, b) = hexToRgb(hex)
		val (h, s, l) = rgbToHsl(r, g, b)
		val newS = max(0.22, s * 0.6)
		val newL = max(0.08, l * 0.8)
		val (nr, ng, nb) = hslToRgb(h, newS, newL)
		return rgbToHex(nr, ng, nb)
	}

	private fun enhancePrimaryColor(r: Int, g: Int, b: Int): String {
		val (h, s, l) = rgbToHsl(r, g, b)
		if (s < 0.08) {
			return rgbToHex(r, g, b)
		}

		val boostedS = clamp(max(s, 0.28) * 1.05, 0.0, 0.92)
		val clampedL = clamp(l, 0.2, 0.78)
		val (nr, ng, nb) = hslToRgb(h, boostedS, clampedL)
		return rgbToHex(nr, ng, nb)
	}

	private fun enhanceAccentColor(r: Int, g: Int, b: Int): String {
		val (h, s, l) = rgbToHsl(r, g, b)
		val boostedS = clamp(max(s, 0.34) * 1.08, 0.0, 0.95)
		val clampedL = clamp(l, 0.24, 0.74)
		val (nr, ng, nb) = hslToRgb(h, boostedS, clampedL)
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

	private fun mutedTextColor(textHex: String, surfaceHex: String): String {
		val (tr, tg, tb) = hexToRgb(textHex)
		val (sr, sg, sb) = hexToRgb(surfaceHex)
		fun mix(text: Int, surface: Int): Int {
			return text + ((surface - text) * 0.22).toInt()
		}
		return rgbToHex(mix(tr, sr), mix(tg, sg), mix(tb, sb))
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

	private fun clamp(value: Double, minValue: Double, maxValue: Double): Double {
		return max(minValue, min(maxValue, value))
	}

	private fun normalizedHueDistance(a: Double, b: Double): Double {
		val delta = abs(a - b)
		return min(delta, 360.0 - delta) / 180.0
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

	private fun generateBlurredBytes(originalBytes: ByteArray): ByteArray? {
		return try {
			val original = BitmapFactory.decodeByteArray(originalBytes, 0, originalBytes.size)
				?: return null
			// Repeatedly halve with bilinear filtering down to ~8px on the short edge.
			// Each halving is a box-blur pass that averages 4 pixels into 1; many passes
			// together approximate a Gaussian blur, smoothing colour zones without the
			// hard linear ramps you get from a single large downsample step.
			var current = original
			while (current.width > 8 && current.height > 8) {
				val nextW = maxOf(8, current.width / 2)
				val nextH = maxOf(8, current.height / 2)
				val next = Bitmap.createScaledBitmap(current, nextW, nextH, true)
				current.recycle()
				current = next
			}
			// Two-step upsample: jumping directly from 8px to 200px lets bilinear
			// interpolation show as linear ramps between samples. The intermediate
			// step at 48px smooths those transitions before the final upscale.
			val mid = Bitmap.createScaledBitmap(current, 48, 48, true)
			current.recycle()
			val smooth = Bitmap.createScaledBitmap(mid, 200, 200, true)
			mid.recycle()
			val out = ByteArrayOutputStream()
			smooth.compress(Bitmap.CompressFormat.JPEG, 90, out)
			smooth.recycle()
			out.toByteArray()
		} catch (error: Throwable) {
			Log.e(tag, "Failed to generate blurred bytes", error)
			null
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

private class AtollaTrackValdiVideoPlayer(
	private val context: android.content.Context,
	initialSourceUrl: String,
) : ValdiVideoPlayer, Disposable {
	private val mainHandler = Handler(Looper.getMainLooper())
	private val view = View(context)
	private val progressIntervalMs = 300L

	@Volatile private var callbacks: ValdiVideoPlayer.Callbacks? = null
	@Volatile private var disposed = false
	@Volatile private var isPrepared = false
	@Volatile private var mediaPlayer: MediaPlayer? = null
	@Volatile private var pendingSeekToMs: Int? = null
	@Volatile private var playbackRate: Float = 0f
	@Volatile private var sourceUrl: String = initialSourceUrl
	@Volatile private var volume: Float = 1f

	private val progressRunnable = object : Runnable {
		override fun run() {
			if (disposed) {
				return
			}

			val player = mediaPlayer
			if (player != null && isPrepared) {
				try {
					val positionMs = player.currentPosition.toDouble()
					val durationMs = player.duration.toDouble().coerceAtLeast(0.0)
					callbacks?.onProgressUpdated?.let { callback ->
						ValdiMarshaller.use { marshaller ->
							marshaller.pushDouble(positionMs)
							marshaller.pushDouble(durationMs)
							callback.safePerform(marshaller)
						}
					}
				} catch (_: Throwable) {
					// best effort progress callback
				}
			}

			mainHandler.postDelayed(this, progressIntervalMs)
		}
	}

	init {
		mainHandler.post {
			if (disposed) {
				return@post
			}
			initializePlayer()
			mainHandler.post(progressRunnable)
		}
	}

	override fun getView(): View = view

	override fun setRequestPayload(payload: Any?) {
		val typedPayload = payload as? AtollaTrackVideoRequestPayload ?: return
		if (typedPayload.sourceUrl == sourceUrl) {
			return
		}

		sourceUrl = typedPayload.sourceUrl
		mainHandler.post {
			if (disposed) {
				return@post
			}
			initializePlayer()
		}
	}

	override fun setVolume(volume: Float) {
		this.volume = volume
		mainHandler.post {
			mediaPlayer?.setVolume(volume, volume)
		}
	}

	override fun setPlaybackRate(rate: Float) {
		playbackRate = rate
		mainHandler.post {
			applyPlaybackRate()
		}
	}

	override fun setSeekToTime(time: Float) {
		val seekMs = time.toInt().coerceAtLeast(0)
		pendingSeekToMs = seekMs
		mainHandler.post {
			val player = mediaPlayer ?: return@post
			if (!isPrepared) {
				return@post
			}

			try {
				player.seekTo(seekMs)
				pendingSeekToMs = null
			} catch (_: Throwable) {
				// ignored
			}
		}
	}

	override fun setCallbacks(callbacks: ValdiVideoPlayer.Callbacks?) {
		this.callbacks = callbacks
	}

	override fun dispose() {
		disposed = true
		mainHandler.removeCallbacks(progressRunnable)
		mainHandler.post {
			releasePlayer()
		}
	}

	private fun initializePlayer() {
		releasePlayer()
		isPrepared = false

		val player = MediaPlayer()
		player.setAudioAttributes(
			AudioAttributes.Builder()
				.setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
				.setUsage(AudioAttributes.USAGE_MEDIA)
				.build(),
		)

		player.setOnPreparedListener { preparedPlayer ->
			if (disposed) {
				return@setOnPreparedListener
			}

			isPrepared = true
			preparedPlayer.setVolume(volume, volume)
			pendingSeekToMs?.let { seekMs ->
				try {
					preparedPlayer.seekTo(seekMs)
					pendingSeekToMs = null
				} catch (_: Throwable) {
					// ignored
				}
			}

			callbacks?.onVideoLoaded?.let { callback ->
				ValdiMarshaller.use { marshaller ->
					marshaller.pushDouble(preparedPlayer.duration.toDouble())
					callback.safePerform(marshaller)
				}
			}

			applyPlaybackRate()
		}

		player.setOnCompletionListener {
			callbacks?.onCompleted?.let { callback ->
				ValdiMarshaller.use { marshaller ->
					callback.safePerform(marshaller)
				}
			}
		}

		player.setOnErrorListener { _, what, extra ->
			callbacks?.onError?.let { callback ->
				ValdiMarshaller.use { marshaller ->
					marshaller.pushString("MediaPlayer error what=$what extra=$extra")
					callback.safePerform(marshaller)
				}
			}
			true
		}

		try {
			player.setDataSource(context, Uri.parse(sourceUrl))
			player.prepareAsync()
			mediaPlayer = player
		} catch (error: Throwable) {
			callbacks?.onError?.let { callback ->
				ValdiMarshaller.use { marshaller ->
					marshaller.pushString(error.message ?: "setDataSource failed")
					callback.safePerform(marshaller)
				}
			}
			releasePlayer()
		}
	}

	private fun applyPlaybackRate() {
		val player = mediaPlayer ?: return
		if (!isPrepared) {
			return
		}

		if (playbackRate <= 0f) {
			if (player.isPlaying) {
				player.pause()
			}
			return
		}

		if (!player.isPlaying) {
			try {
				player.start()
				callbacks?.onBeginPlayback?.let { callback ->
					ValdiMarshaller.use { marshaller ->
						callback.safePerform(marshaller)
					}
				}
			} catch (_: Throwable) {
				// ignored
			}
		}

		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
			try {
				player.playbackParams = player.playbackParams.setSpeed(playbackRate)
			} catch (_: Throwable) {
				// ignored
			}
		}
	}

	private fun releasePlayer() {
		val player = mediaPlayer
		mediaPlayer = null
		isPrepared = false
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
}
