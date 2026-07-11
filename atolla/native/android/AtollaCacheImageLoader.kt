package com.tx3stn.atolla

import atolla.native.android.AtollaDiskCacheStats
import atolla.native.android.AtollaDiskStatsSnapshot
import atolla.native.android.AtollaImageFallback
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.util.LruCache
import com.snap.valdi.exceptions.ValdiException
import com.snap.valdi.utils.Disposable
import com.snap.valdi.utils.ValdiAssetLoadOutputType
import com.snap.valdi.utils.ValdiImage
import com.snap.valdi.utils.ValdiImageContent
import com.snap.valdi.utils.ValdiImageFactory
import com.snap.valdi.utils.ValdiImageLoadCompletion
import com.snap.valdi.utils.ValdiImageLoadOptions
import com.snap.valdi.utils.ValdiImageLoader
import com.snap.valdi.utils.ValdiImageWithBitmap
import com.snap.valdi.utils.ValdiImageWithContent
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Request
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.security.MessageDigest
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.PriorityBlockingQueue
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import kotlin.math.max
import kotlin.math.min

data class AtollaCacheRequestPayload(
	val cacheKey: String,
	val cacheOnly: Boolean,
	val category: String,
	val sourceUrl: String,
)

class AtollaCacheImageLoader : ValdiImageLoader {
	private data class BitmapDecodePlan(
		val bitmapKey: String,
		val maxDimension: Int,
	)

	private data class DiskCacheEntry(
		val file: File,
		val bytes: Long,
		val modifiedAtMs: Long,
	)

	companion object {
		private const val MEMORY_CACHE_BYTES = 200 * 1024 * 1024
		private const val MIN_BITMAP_MAX_DIMENSION = 128
		private const val MAX_BITMAP_MAX_DIMENSION = 2048
		private const val DEFAULT_ALBUM_BITMAP_MAX_DIMENSION = 384
		private const val DEFAULT_BLURRED_BITMAP_MAX_DIMENSION = 256
		private const val DEFAULT_ARTIST_BITMAP_MAX_DIMENSION = 768
		private const val DEFAULT_PLAYLIST_BITMAP_MAX_DIMENSION = 384
		private const val DEFAULT_LOGO_BITMAP_MAX_DIMENSION = 512
		private const val DEFAULT_BITMAP_MAX_DIMENSION = 768
		private const val PROCESSING_DECODE_MAX_DIMENSION = 512
		@Volatile var diskCacheMaxBytes = 200L * 1024 * 1024
		private const val DISK_CACHE_TTL_MS = 30L * 24 * 3600 * 1000

		private val httpClient = OkHttpClient.Builder()
			.protocols(listOf(Protocol.HTTP_2, Protocol.HTTP_1_1))
			.connectTimeout(10, TimeUnit.SECONDS)
			.readTimeout(30, TimeUnit.SECONDS)
			.build()

		private val redirectlessHttpClient = httpClient.newBuilder()
			.followRedirects(false)
			.followSslRedirects(false)
			.build()

		private enum class LoadPriority(val value: Int) {
			DISPLAY(0),
			PREFETCH(1),
		}

		private val taskSequence = AtomicLong(0)

		private class LoadTask(
			val priority: LoadPriority,
			private val sequence: Long = taskSequence.incrementAndGet(),
			val runTask: () -> Unit,
		) : Runnable, Comparable<LoadTask> {
			override fun run() {
				runTask()
			}

			override fun compareTo(other: LoadTask): Int {
				val byPriority = priority.value.compareTo(other.priority.value)
				if (byPriority != 0) {
					return byPriority
				}

				return sequence.compareTo(other.sequence)
			}
		}

		private val executor = ThreadPoolExecutor(
			12,
			12,
			30L,
			TimeUnit.SECONDS,
			PriorityBlockingQueue<Runnable>(),
			{ runnable ->
				Thread(runnable, "atolla-image-loader").also { it.isDaemon = true }
			},
		).also { it.allowCoreThreadTimeOut(true) }

		private val sharedMemory = object : LruCache<String, ByteArray>(MEMORY_CACHE_BYTES) {
			override fun sizeOf(key: String, value: ByteArray): Int {
				return value.size
			}
		}
		private val sharedBitmapMemory = object : LruCache<String, Bitmap>(
			(Runtime.getRuntime().maxMemory() / 4).toInt()
		) {
			override fun sizeOf(key: String, value: Bitmap): Int {
				return value.byteCount
			}
		}
		private val inFlight = ConcurrentHashMap<String, CompletableFuture<ByteArray>>()
		private val diskEvictionScheduled = AtomicBoolean(false)
		private val diskEvictionRequested = AtomicBoolean(false)
		// Valdi's image pipeline requires completion callbacks on the main thread.
		// images served from the memory fast-path are already on the main thread;
		// disk/network paths run on background threads and must post back here
		private val mainHandler by lazy { Handler(Looper.getMainLooper()) }
		var sharedInstance: AtollaCacheImageLoader? = null
		var imageCachedObserver: ((url: String, category: String) -> Unit)? = null
		// current Jellyfin access token, pushed out-of-band on session change; applied as an
		// auth header on network fetches so the token never travels in an image URL
		@Volatile
		var authToken: String? = null
	}

	private val tag = "AtollaCacheLoader"
	private val diskCacheFolder = "atolla-image-cache"
	private val memory = sharedMemory
	private val bitmapMemory = sharedBitmapMemory

	init {
		sharedInstance = this
	}
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
		return memory.snapshot().size
	}

	fun getTotalBytes(): Long {
		val diskStats = getDiskStats()
		if (diskStats != null) {
			return diskStats.second
		}
		return memory.snapshot().values.sumOf { it.size.toLong() }
	}

	fun getDiskEntryCount(): Int = getDiskStats()?.first ?: 0

	fun getDiskByteSize(): Long = getDiskStats()?.second ?: 0L

	// Single directory scan producing count, bytes and per-category counts together, so callers can
	// avoid the three separate scans the individual getters incur.
	fun getDiskStatsSnapshot(): AtollaDiskStatsSnapshot = AtollaDiskCacheStats.scan(diskCacheDir)

	fun getDiskCategoryCountsJson(): String {
		val dir = diskCacheDir ?: return "{}"
		val files = try { dir.listFiles() } catch (_: Throwable) { null } ?: return "{}"
		val counts = mutableMapOf<String, Int>()
		for (file in files) {
			if (!file.isFile) continue
			// Filename format: {category}_{sha256_64_hex}
			// SHA-256 is always 64 hex chars, so strip the trailing 65 chars (underscore + hash).
			val name = file.name
			if (name.length < 66) continue
			val cat = name.dropLast(65)
			if (cat.isNotEmpty()) counts[cat] = (counts[cat] ?: 0) + 1
		}
		val obj = org.json.JSONObject()
		counts.forEach { (k, v) -> obj.put(k, v) }
		return obj.toString()
	}

	fun setDiskCacheMaxBytes(bytes: Long) {
		diskCacheMaxBytes = bytes
	}

	fun clearCategories(categories: List<String>) {
		// Keep full-size and thumb variants in sync when clearing categories.
		val expanded = categories.toMutableSet()
		if (expanded.contains("album_art")) expanded.addAll(listOf("album_art_blurred", "album_art_thumb", "album_art_palette"))
		if (expanded.contains("album_art_thumb")) expanded.add("album_art")
		if (expanded.contains("artist_image")) expanded.add("artist_image_thumb")
		if (expanded.contains("artist_image_thumb")) expanded.add("artist_image")
		if (expanded.contains("playlist_image")) expanded.add("playlist_image_thumb")
		if (expanded.contains("playlist_image_thumb")) expanded.add("playlist_image")
		val prefixes = expanded.map { "$it:" }

		// Clear matching entries from memory.
		val memKeys = memory.snapshot().keys.filter { k -> prefixes.any { k.startsWith(it) } }
		for (k in memKeys) memory.remove(k)

		val bitmapKeys = bitmapMemory.snapshot().keys.filter { k -> prefixes.any { k.startsWith(it) } }
		for (k in bitmapKeys) bitmapMemory.remove(k)

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
		val identity = AtollaImageFallback.imageCacheIdentity(sourceUrl)
		// try the side-car key written at cache time, no decode needed
		if (category == "album_art") {
			val paletteKey = "album_art_palette:$identity"
			val sidecar = memory.get(paletteKey) ?: readFromDisk(paletteKey)
			if (sidecar != null) return String(sidecar, Charsets.UTF_8)
		}
		val key = "$category:$identity"
		val bytes = memory.get(key) ?: readFromDisk(key) ?: return null
		return extractPaletteFromBytes(bytes, key)
	}

	private fun writePaletteSidecarIfNeeded(identity: String, category: String, bytes: ByteArray) {
		if (category != "album_art") return
		val paletteJson = extractPaletteFromBytes(bytes, identity) ?: return
		val paletteKey = "album_art_palette:$identity"
		val paletteBytes = paletteJson.toByteArray(Charsets.UTF_8)
		memory.put(paletteKey, paletteBytes)
		writeToDisk(paletteKey, paletteBytes)
	}

	private fun extractPaletteFromBytes(bytes: ByteArray, logKey: String): String? {
		val bitmap = decodeSampledBitmap(bytes, PROCESSING_DECODE_MAX_DIMENSION) ?: run {
			Log.e(tag, "Failed to decode image for palette extraction: $logKey")
			return null
		}
		val width = bitmap.width
		val height = bitmap.height
		val pixels = IntArray(width * height)
		bitmap.getPixels(pixels, 0, width, 0, 0, width, height)
		bitmap.recycle()
		return try {
			nativeExtractPaletteFromPixels(pixels, width, height)
		} catch (error: Throwable) {
			Log.e(tag, "Failed to extract palette for key=$logKey", error)
			null
		}
	}

	private external fun nativeExtractPaletteFromPixels(pixels: IntArray, width: Int, height: Int): String?
	private external fun nativeBlurPixels(pixels: IntArray, width: Int, height: Int, outWidth: Int, outHeight: Int): IntArray?

	fun resolveCachedFileUrl(category: String, sourceUrl: String): String? {
		if (category.isBlank() || sourceUrl.isBlank()) {
			return null
		}

		val key = "$category:${AtollaImageFallback.imageCacheIdentity(sourceUrl)}"
		val file = cacheFileForKey(key) ?: return null
		if (!file.exists() || !file.isFile) {
			return null
		}

		return try {
			file.setLastModified(System.currentTimeMillis())
			Uri.fromFile(file).toString()
		} catch (_: Throwable) {
			null
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
		val category = url.getQueryParameter("c")
		val cacheOnly = url.getQueryParameter("co") == "1"
		val source = url.getQueryParameter("u")
		if (url.scheme != "atolla-cache" || url.host != "image" || category.isNullOrBlank() || source.isNullOrBlank()) {
			throw ValdiException("Invalid atolla-cache image URL")
		}
		return AtollaCacheRequestPayload(
			cacheKey = AtollaImageFallback.imageCacheIdentity(source),
			cacheOnly = cacheOnly,
			category = category,
			sourceUrl = source,
		)
	}

		override fun loadImage(
		requetPayload: Any,
		options: ValdiImageLoadOptions,
		completion: ValdiImageLoadCompletion,
	): Disposable? {
		val payload = requetPayload as AtollaCacheRequestPayload
		val key = "${payload.category}:${payload.cacheKey}"
		val bitmapPlan = resolveBitmapDecodePlan(key, payload.category, options)
		Log.d(tag, "loadImage key=$key outputType=${options.outputType}")

		// bitmap cache hit: decoded bitmap is ready, deliver synchronously without dispatching
		// to a background thread, so scrolling back into view is instant
		if (options.outputType == ValdiAssetLoadOutputType.BITMAP) {
			bitmapMemory.get(bitmapPlan.bitmapKey)?.let { bitmap ->
				if (bitmap.isRecycled) {
					bitmapMemory.remove(bitmapPlan.bitmapKey)
				} else {
					val copy = safeCopyForDelivery(bitmap)
					if (copy != null) {
				Log.d(tag, "bitmap cache hit key=${bitmapPlan.bitmapKey}")
				completion.onImageLoadComplete(0, 0, ValdiImageWithBitmap(copy), null)
				return object : Disposable { override fun dispose() {} }
					}
					bitmapMemory.remove(bitmapPlan.bitmapKey)
				}
			}
		}

		// Memory hit: bytes already in RAM. Decode and deliver synchronously on the
		// calling thread (the UI thread) so there's zero async latency and no blank frame
		// between Valdi clearing the old image and showing the new one. bitmap decode for a
		// thumbnail is <1ms, preferable to a 16ms blank frame
		memory.get(key)?.let { bytes ->
			Log.d(tag, "cache hit key=$key bytes=${bytes.size}")
			val image: ValdiImage = when (options.outputType) {
				ValdiAssetLoadOutputType.RAW_CONTENT ->
					ValdiImageWithContent(ValdiImageContent.Bytes(bytes))
				ValdiAssetLoadOutputType.BITMAP -> {
					val bitmap = getOrDecodeBitmap(bytes, bitmapPlan)
					if (bitmap != null) {
						val copy = safeCopyForDelivery(bitmap)
						if (copy != null) {
							ValdiImageWithBitmap(copy)
						} else {
							bitmapMemory.remove(bitmapPlan.bitmapKey)
							ValdiImageFactory.fromByteArray(bytes)
						}
					} else {
						ValdiImageFactory.fromByteArray(bytes)
					}
				}
				else -> {
					val cancelled = AtomicBoolean(false)
					executor.execute(LoadTask(LoadPriority.DISPLAY) {
						completeFromBytes(key, bytes, options, completion, cancelled)
					})
					return object : Disposable { override fun dispose() { cancelled.set(true) } }
				}
			}
			completion.onImageLoadComplete(0, 0, image, null)
			return object : Disposable { override fun dispose() {} }
		}

		// disk fast-path for fixed-size thumbnails: read synchronously on the calling thread
		// (the UI thread) before dispatching to the background executor. thumbnail files are
		// <100 KB so a sequential read takes well under 1 ms, far cheaper than a
		// mainHandler.post() which costs at least one full frame and is the direct cause of the
		// pop-in on scroll-back when images are already on disk but not yet in memory
		if (isFixedThumbCategory(payload.category)) {
			readFromDisk(key)?.let { bytes ->
				memory.put(key, bytes)
				when (options.outputType) {
					ValdiAssetLoadOutputType.BITMAP -> {
						val bitmap = getOrDecodeBitmap(bytes, bitmapPlan)
						val image = if (bitmap != null) {
							val copy = safeCopyForDelivery(bitmap)
							if (copy != null) ValdiImageWithBitmap(copy) else ValdiImageFactory.fromByteArray(bytes)
						} else {
							ValdiImageFactory.fromByteArray(bytes)
						}
						Log.d(tag, "disk fast-path hit key=$key")
						completion.onImageLoadComplete(0, 0, image, null)
						return object : Disposable { override fun dispose() {} }
					}
					ValdiAssetLoadOutputType.RAW_CONTENT -> {
						Log.d(tag, "disk fast-path hit key=$key")
						completion.onImageLoadComplete(0, 0, ValdiImageWithContent(ValdiImageContent.Bytes(bytes)), null)
						return object : Disposable { override fun dispose() {} }
					}
					else -> { /* unsupported output type — fall through to async path */ }
				}
			}
		}

		// disk reads and network fetches happen on a background thread so the calling thread
		// (typically the UI thread) is never blocked. disposing only cancels the completion
		// callback; the download still runs to completion so the result is cached for the next
		// request (e.g. when the same image scrolls back into view)
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
					if (bytes != null) completeFromBytes(key, bytes, options, completion, cancelled)
					else deliverOnMain(cancelled) {
						completion.onImageLoadComplete(0, 0, null, error ?: ValdiException("Download failed"))
					}
				}
			}
			return object : Disposable {
				override fun dispose() { cancelled.set(true) }
			}
		}

		executor.execute(
			LoadTask(LoadPriority.DISPLAY) {
				executeLoadImageTask(payload, key, options, completion, cancelled, newFuture)
			},
		)

		return object : Disposable {
			override fun dispose() {
				cancelled.set(true)
			}
		}
	}

	private fun executeLoadImageTask(
		payload: AtollaCacheRequestPayload,
		key: String,
		options: ValdiImageLoadOptions,
		completion: ValdiImageLoadCompletion,
		cancelled: java.util.concurrent.atomic.AtomicBoolean,
		future: CompletableFuture<ByteArray>,
	) {
		// When the requested full-size variant is missing we may serve its thumbnail as a
		// stop-gap; these track that so the fetch paths below don't re-deliver to the (one-shot)
		// completion and resolve deduped followers with the thumb when the full fetch fails.
		var deliveredFallback = false
		var fallbackBytes: ByteArray? = null
		try {
			// Disk hit: promote to memory and complete.
			readFromDisk(key)?.let { bytes ->
				memory.put(key, bytes)
				Log.d(tag, "disk cache hit key=$key bytes=${bytes.size}")
				inFlight.remove(key)
				future.complete(bytes)
				completeFromBytes(key, bytes, options, completion, cancelled)
				return
			}

			// blurred art: generate from a cached source, preferring the thumbnail (the blur is
			// downsampled to 200x200 so the thumb is plenty and is always downloaded), then the
			// full original; only fetch the full from network if neither is cached
			if (payload.category == "album_art_blurred") {
				val originalKey = "album_art:${payload.cacheKey}"
				val cachedOriginal = AtollaImageFallback.blurSourceKeys(payload.cacheKey)
					.firstNotNullOfOrNull { k -> memory.get(k) ?: readFromDisk(k) }
				if (cachedOriginal != null) {
					val blurredBytes = generateBlurredBytes(cachedOriginal)
					inFlight.remove(key)
					if (blurredBytes != null) {
						memory.put(key, blurredBytes)
						writeToDisk(key, blurredBytes)
						Log.d(tag, "blur generated from cache key=$key bytes=${blurredBytes.size}")
						future.complete(blurredBytes)
						completeFromBytes(key, blurredBytes, options, completion, cancelled)
					} else {
						future.completeExceptionally(ValdiException("Blur generation failed"))
						deliverOnMain(cancelled) { completion.onImageLoadComplete(0, 0, null, ValdiException("Blur generation failed")) }
					}
					return
				}
				val originalBytes = fetchBytes(payload.sourceUrl)
				memory.put(originalKey, originalBytes)
				writeToDisk(originalKey, originalBytes)
				writePaletteSidecarIfNeeded(payload.cacheKey, "album_art", originalBytes)
				val blurredBytes = generateBlurredBytes(originalBytes)
				inFlight.remove(key)
				if (blurredBytes != null) {
					memory.put(key, blurredBytes)
					writeToDisk(key, blurredBytes)
					Log.d(tag, "blur generated after fetch key=$key bytes=${blurredBytes.size}")
					future.complete(blurredBytes)
					completeFromBytes(key, blurredBytes, options, completion, cancelled)
					notifyImageCached(payload.sourceUrl, payload.category)
				} else {
					future.completeExceptionally(ValdiException("Blur generation failed after fetch"))
					deliverOnMain(cancelled) { completion.onImageLoadComplete(0, 0, null, ValdiException("Blur generation failed after fetch")) }
				}
				return
			}

			// Full-variant fallback: the requested full-size variant isn't cached. If its
			// thumbnail is, deliver that now so something shows immediately; the full variant
			// still fetches below to populate the cache for the next render.
			AtollaImageFallback.thumbFallbackCategory(payload.category)?.let { thumbCategory ->
				val thumbKey = "$thumbCategory:${payload.cacheKey}"
				val thumbBytes = memory.get(thumbKey) ?: readFromDisk(thumbKey)
				if (thumbBytes != null) {
					Log.d(tag, "serving thumb fallback $thumbKey for missing $key")
					completeFromBytes(thumbKey, thumbBytes, options, completion, cancelled)
					fallbackBytes = thumbBytes
					deliveredFallback = true
				}
			}

			if (payload.cacheOnly) {
				inFlight.remove(key)
				if (deliveredFallback) {
					future.complete(fallbackBytes!!)
					return
				}
				val ex = ValdiException("Cache miss for cache-only request")
				future.completeExceptionally(ex)
				deliverOnMain(cancelled) { completion.onImageLoadComplete(0, 0, null, ex) }
				return
			}

			val bytes = fetchBytes(payload.sourceUrl)
			Log.d(tag, "network fetch success key=$key bytes=${bytes.size}")
			memory.put(key, bytes)
			writeToDisk(key, bytes)
			writePaletteSidecarIfNeeded(payload.cacheKey, payload.category, bytes)
			inFlight.remove(key)
			future.complete(bytes)
			// If we already served the thumb, don't re-deliver to the one-shot completion; the
			// full bytes are now cached and will be served on the next render.
			if (!deliveredFallback) {
				completeFromBytes(key, bytes, options, completion, cancelled)
			}
			notifyImageCached(payload.sourceUrl, payload.category)
		} catch (error: Throwable) {
			Log.e(tag, "load failed key=$key", error)
			inFlight.remove(key)
			if (deliveredFallback) {
				// The thumb was already delivered; the full fetch failed (likely offline). Resolve
				// deduped followers with the thumb so they show something too, rather than an error.
				future.complete(fallbackBytes!!)
				return
			}
			future.completeExceptionally(error)
			deliverOnMain(cancelled) { completion.onImageLoadComplete(0, 0, null, error) }
		}
	}

	fun preload(rawSourceUrl: String, category: String) {
		if (rawSourceUrl.isBlank() || category.isBlank()) {
			return
		}

		val sourceUrl = stripApiKeyFromUrl(rawSourceUrl)
		val identity = AtollaImageFallback.imageCacheIdentity(sourceUrl)
		val key = "$category:$identity"
		val bitmapPlan = resolveBitmapDecodePlan(key, category, null)

		// bitmap already decoded and cached: nothing to do, but still report it as cached so
		// callers waiting on offline availability (e.g. downloads) resolve
		if (bitmapMemory.get(bitmapPlan.bitmapKey) != null) {
			notifyImageCached(sourceUrl, category)
			return
		}

		// bytes in memory but bitmap not yet decoded. warm the bitmap cache on a background
		// thread so subsequent loadImage calls can serve synchronously
		memory.get(key)?.let { bytes ->
			if (!inFlight.containsKey(key)) {
				executor.execute(LoadTask(LoadPriority.PREFETCH) {
					warmBitmapCache(key, bytes, category)
				})
			}
			notifyImageCached(sourceUrl, category)
			return
		}

		if (inFlight.containsKey(key)) {
			return
		}

		val future = CompletableFuture<ByteArray>()
		if (inFlight.putIfAbsent(key, future) != null) {
			return
		}

		executor.execute(
			LoadTask(LoadPriority.PREFETCH) {
				executePreloadTask(sourceUrl, identity, category, key, future)
			},
		)
	}

	private fun warmBitmapCache(key: String, bytes: ByteArray, category: String) {
		if (category == "album_art_blurred") return
		val bitmapPlan = resolveBitmapDecodePlan(key, category, null)
		if (bitmapMemory.get(bitmapPlan.bitmapKey) != null) return
		getOrDecodeBitmap(bytes, bitmapPlan)
	}

	private fun executePreloadTask(
		sourceUrl: String,
		identity: String,
		category: String,
		key: String,
		future: CompletableFuture<ByteArray>,
	) {
		try {
			readFromDisk(key)?.let { bytes ->
				memory.put(key, bytes)
				inFlight.remove(key)
				future.complete(bytes)
				warmBitmapCache(key, bytes, category)
				// already on disk; report cached so offline-availability waiters resolve
				notifyImageCached(sourceUrl, category)
				return
			}

			if (category == "album_art_blurred") {
				val originalKey = "album_art:$identity"
				val cachedOriginal = AtollaImageFallback.blurSourceKeys(identity)
					.firstNotNullOfOrNull { k -> memory.get(k) ?: readFromDisk(k) }
				if (cachedOriginal != null) {
					val blurredBytes = generateBlurredBytes(cachedOriginal)
					inFlight.remove(key)
					if (blurredBytes != null) {
						memory.put(key, blurredBytes)
						writeToDisk(key, blurredBytes)
						future.complete(blurredBytes)
					} else {
						future.completeExceptionally(ValdiException("Blur generation failed"))
					}
					return
				}

				val originalBytes = fetchBytes(sourceUrl)
				memory.put(originalKey, originalBytes)
				writeToDisk(originalKey, originalBytes)
				writePaletteSidecarIfNeeded(identity, "album_art", originalBytes)
				val blurredBytes = generateBlurredBytes(originalBytes)
				inFlight.remove(key)
				if (blurredBytes != null) {
					memory.put(key, blurredBytes)
					writeToDisk(key, blurredBytes)
					future.complete(blurredBytes)
					notifyImageCached(sourceUrl, category)
				} else {
					future.completeExceptionally(ValdiException("Blur generation failed after fetch"))
				}
				return
			}

			val bytes = fetchBytes(sourceUrl)
			memory.put(key, bytes)
			writeToDisk(key, bytes)
			writePaletteSidecarIfNeeded(identity, category, bytes)
			inFlight.remove(key)
			future.complete(bytes)
			warmBitmapCache(key, bytes, category)
			notifyImageCached(sourceUrl, category)
		} catch (error: Throwable) {
			inFlight.remove(key)
			future.completeExceptionally(error)
			Log.e(tag, "preload failed key=$key", error)
		}
	}

	private fun notifyImageCached(url: String, category: String) {
		try {
			imageCachedObserver?.invoke(url, category)
		} catch (error: Throwable) {
			Log.e(tag, "Failed to notify image cached observer", error)
		}
	}

	// defensive: the token is delivered out-of-band via authToken and applied as a header, never
	// in the URL, but strip any stray api_key so a token can never reach a cache key or the disk
	private fun stripApiKeyFromUrl(url: String): String {
		return try {
			val uri = Uri.parse(url)
			if (uri.getQueryParameter("api_key").isNullOrBlank()) {
				url
			} else {
				uri.buildUpon().clearQuery().also { builder ->
					for (name in uri.queryParameterNames) {
						if (name != "api_key") builder.appendQueryParameter(name, uri.getQueryParameter(name))
					}
				}.build().toString()
			}
		} catch (_: Throwable) {
			url
		}
	}

	private val maxImageRedirects = 5

	// keep the token only while a redirect stays on the server's host and doesn't drop to http;
	// anything off-host or downgraded to cleartext must not see it (same rule as the track download)
	private fun redirectKeepsAuth(server: HttpUrl, target: HttpUrl): Boolean {
		if (server.host != target.host) {
			return false
		}
		return !(server.scheme == "https" && target.scheme == "http")
	}

	private fun fetchBytes(url: String): ByteArray {
		val serverOrigin = url.toHttpUrlOrNull() ?: throw IOException("Invalid image url: $url")
		var current = serverOrigin
		var redirectCount = 0
		while (true) {
			val token = AtollaCacheImageLoader.authToken
			val builder = Request.Builder().url(current)
			if (!token.isNullOrBlank() && redirectKeepsAuth(serverOrigin, current)) {
				builder.addHeader("X-Emby-Token", token)
				builder.addHeader("Authorization", "MediaBrowser Token=\"$token\"")
			}
			val response = redirectlessHttpClient.newCall(builder.build()).execute()
			if (response.isRedirect && redirectCount < maxImageRedirects) {
				val location = response.header("Location")
				val next = location?.let { current.resolve(it) }
				response.close()
				if (next == null) {
					throw IOException("Image redirect missing Location")
				}
				current = next
				redirectCount++
				continue
			}
			return response.use {
				if (!it.isSuccessful) {
					throw IOException("HTTP ${it.code}")
				}
				it.body?.bytes() ?: throw IOException("Empty body")
			}
		}
	}

	// deliver a completion callback on the main thread. when already on the main thread (memory
	// fast-path) the block runs synchronously; from a background thread (disk/network path) it
	// is posted so Valdi can update the image view on the next message-loop iteration. cancelled
	// is re-checked inside the post to handle disposal between the post and execution
	private fun deliverOnMain(cancelled: AtomicBoolean? = null, deliver: () -> Unit) {
		if (Looper.myLooper() == Looper.getMainLooper()) {
			if (cancelled?.get() != true) deliver()
		} else {
			mainHandler.post { if (cancelled?.get() != true) deliver() }
		}
	}

	private fun completeFromBytes(
		key: String,
		bytes: ByteArray,
		options: ValdiImageLoadOptions,
		completion: ValdiImageLoadCompletion,
		cancelled: AtomicBoolean? = null,
	) {
		val category = key.substringBefore(':')
		val bitmapPlan = resolveBitmapDecodePlan(key, category, options)
		val image: ValdiImage = when (options.outputType) {
			ValdiAssetLoadOutputType.BITMAP -> {
				val bitmap = getOrDecodeBitmap(bytes, bitmapPlan)
				if (bitmap != null) {
					val copy = safeCopyForDelivery(bitmap)
					if (copy != null) {
						ValdiImageWithBitmap(copy)
					} else {
						bitmapMemory.remove(bitmapPlan.bitmapKey)
						ValdiImageFactory.fromByteArray(bytes)
					}
				} else {
					ValdiImageFactory.fromByteArray(bytes)
				}
			}
			ValdiAssetLoadOutputType.RAW_CONTENT -> ValdiImageWithContent(ValdiImageContent.Bytes(bytes))
			else -> {
				deliverOnMain(cancelled) {
					completion.onImageLoadComplete(
						0,
						0,
						null,
						ValdiException("Unsupported output type: ${options.outputType}"),
					)
				}
				return
			}
		}

		deliverOnMain(cancelled) { completion.onImageLoadComplete(0, 0, image, null) }
	}

	private fun resolveBitmapDecodePlan(
		key: String,
		category: String,
		options: ValdiImageLoadOptions?,
	): BitmapDecodePlan {
		val categoryDefault = defaultBitmapMaxDimensionForCategory(category)
		if (isFixedThumbCategory(category)) {
			val fixed = quantizeBitmapMaxDimension(normalizeBitmapMaxDimension(categoryDefault))
			return BitmapDecodePlan(bitmapKey = "$key#md=$fixed", maxDimension = fixed)
		}
		val requestedMaxDimension = options?.let { resolveRequestedBitmapMaxDimension(it) }
		val candidate = when {
			requestedMaxDimension == null -> categoryDefault
			else -> max(categoryDefault, requestedMaxDimension)
		}
		val maxDimension = quantizeBitmapMaxDimension(normalizeBitmapMaxDimension(candidate))
		return BitmapDecodePlan(bitmapKey = "$key#md=$maxDimension", maxDimension = maxDimension)
	}

	private fun isFixedThumbCategory(category: String): Boolean {
		return category == "album_art_thumb" ||
			category == "artist_image_thumb" ||
			category == "playlist_image_thumb"
	}

	private fun defaultBitmapMaxDimensionForCategory(category: String): Int {
		return when (category) {
			"album_art" -> DEFAULT_ALBUM_BITMAP_MAX_DIMENSION
			"album_art_thumb" -> DEFAULT_ALBUM_BITMAP_MAX_DIMENSION
			"album_art_blurred" -> DEFAULT_BLURRED_BITMAP_MAX_DIMENSION
			"artist_image" -> DEFAULT_ARTIST_BITMAP_MAX_DIMENSION
			"artist_image_thumb" -> DEFAULT_ARTIST_BITMAP_MAX_DIMENSION
			"playlist_image" -> DEFAULT_PLAYLIST_BITMAP_MAX_DIMENSION
			"playlist_image_thumb" -> DEFAULT_PLAYLIST_BITMAP_MAX_DIMENSION
			"artist_logo" -> DEFAULT_LOGO_BITMAP_MAX_DIMENSION
			else -> DEFAULT_BITMAP_MAX_DIMENSION
		}
	}

	private fun normalizeBitmapMaxDimension(value: Int): Int {
		return value.coerceIn(MIN_BITMAP_MAX_DIMENSION, MAX_BITMAP_MAX_DIMENSION)
	}

	private fun resolveRequestedBitmapMaxDimension(options: ValdiImageLoadOptions): Int? {
		val propertyNames = listOf(
			"targetWidth",
			"targetHeight",
			"requestedWidth",
			"requestedHeight",
			"maxWidth",
			"maxHeight",
			"desiredWidth",
			"desiredHeight",
		)

		var maxDimension = 0
		for (name in propertyNames) {
			val value = readIntLikeProperty(options, name)
			if (value != null && value > maxDimension) {
				maxDimension = value
			}
		}

		return if (maxDimension > 0) maxDimension else null
	}

	private fun quantizeBitmapMaxDimension(value: Int): Int {
		val buckets = intArrayOf(128, 192, 256, 320, 384, 512, 640, 768, 1024, 1280, 1536, 2048)
		for (bucket in buckets) {
			if (value <= bucket) return bucket
		}
		return MAX_BITMAP_MAX_DIMENSION
	}

	private fun readIntLikeProperty(target: Any, name: String): Int? {
		val clazz = target::class.java
		val getterName = "get${name.replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }}"

		val methodNames = listOf(name, getterName)
		for (methodName in methodNames) {
			val method = clazz.methods.firstOrNull { it.name == methodName && it.parameterCount == 0 } ?: continue
			val value = runCatching { method.invoke(target) }.getOrNull() as? Number ?: continue
			return value.toInt()
		}

		val field = runCatching { clazz.getDeclaredField(name).apply { isAccessible = true } }.getOrNull()
		val fieldValue = runCatching { field?.get(target) }.getOrNull() as? Number
		return fieldValue?.toInt()
	}

	private fun getOrDecodeBitmap(bytes: ByteArray, bitmapPlan: BitmapDecodePlan): Bitmap? {
		bitmapMemory.get(bitmapPlan.bitmapKey)?.let {
			if (!it.isRecycled) return it
			bitmapMemory.remove(bitmapPlan.bitmapKey)
		}
		val decoded = decodeSampledBitmap(bytes, bitmapPlan.maxDimension) ?: return null
		decoded.copy(Bitmap.Config.ARGB_8888, false)?.let { bitmapMemory.put(bitmapPlan.bitmapKey, it) }
		return decoded
	}

	private fun safeCopyForDelivery(bitmap: Bitmap): Bitmap? {
		if (bitmap.isRecycled) return null
		return runCatching {
			bitmap.copy(bitmap.config ?: Bitmap.Config.ARGB_8888, false)
		}.getOrNull()
	}

	private fun decodeSampledBitmap(bytes: ByteArray, maxDimension: Int): Bitmap? {
		val boundsOptions = BitmapFactory.Options().apply { inJustDecodeBounds = true }
		BitmapFactory.decodeByteArray(bytes, 0, bytes.size, boundsOptions)

		if (boundsOptions.outWidth <= 0 || boundsOptions.outHeight <= 0) {
			return BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
		}

		val sampleSize = calculateInSampleSize(boundsOptions.outWidth, boundsOptions.outHeight, maxDimension)
		val decodeOptions = BitmapFactory.Options().apply {
			inPreferredConfig = Bitmap.Config.ARGB_8888
			inSampleSize = sampleSize
		}
		return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, decodeOptions)
	}

	private fun calculateInSampleSize(width: Int, height: Int, maxDimension: Int): Int {
		var sampleSize = 1
		while (max(width / sampleSize, height / sampleSize) > maxDimension) {
			sampleSize *= 2
		}
		return sampleSize
	}

	internal fun resolveAppCacheDir(): File? {
		return try {
			val activityThreadClass = Class.forName("android.app.ActivityThread")
			val app = activityThreadClass.getMethod("currentApplication").invoke(null) as? android.app.Application ?: return null
			app.cacheDir
		} catch (e: Throwable) {
			Log.e(tag, "Unable to resolve application cache dir", e)
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
			val bytes = file.readBytes()
			file.setLastModified(System.currentTimeMillis())
			bytes
		} catch (error: Throwable) {
			Log.e(tag, "Failed reading disk cache key=$key", error)
			null
		}
	}

	private fun writeToDisk(key: String, bytes: ByteArray) {
		val file = cacheFileForKey(key) ?: return
		try {
			file.writeBytes(bytes)
			evictDiskCacheIfNeeded()
		} catch (error: Throwable) {
			Log.e(tag, "Failed writing disk cache key=$key", error)
		}
	}

	private fun evictDiskCacheIfNeeded() {
		diskEvictionRequested.set(true)
		if (!diskEvictionScheduled.compareAndSet(false, true)) {
			return
		}

		executor.execute(
			LoadTask(LoadPriority.PREFETCH) {
				try {
					drainDiskEvictionRequests()
				} finally {
					diskEvictionScheduled.set(false)
					if (diskEvictionRequested.get()) {
						evictDiskCacheIfNeeded()
					}
				}
			},
		)
	}

	private fun drainDiskEvictionRequests() {
		do {
			diskEvictionRequested.set(false)
			runDiskEvictionPass()
		} while (diskEvictionRequested.get())
	}

	private fun runDiskEvictionPass() {
		val dir = diskCacheDir ?: return
		val files = try {
			dir.listFiles()?.filter { it.isFile }
		} catch (_: Throwable) {
			null
		} ?: return

		val now = System.currentTimeMillis()
		val liveFiles = mutableListOf<DiskCacheEntry>()
		for (file in files) {
			val modifiedAtMs = file.lastModified()
			val age = now - modifiedAtMs
			if (age > DISK_CACHE_TTL_MS) {
				try {
					file.delete()
				} catch (_: Throwable) {
					// best effort disk cleanup
				}
				continue
			}
			liveFiles.add(
				DiskCacheEntry(
					file = file,
					bytes = file.length(),
					modifiedAtMs = modifiedAtMs,
				),
			)
		}

		var totalBytes = liveFiles.sumOf { it.bytes }
		if (totalBytes <= diskCacheMaxBytes) {
			return
		}

		val oldestFirst = liveFiles.sortedWith(compareBy<DiskCacheEntry> { it.modifiedAtMs }.thenBy { it.file.name })
		for (entry in oldestFirst) {
			if (totalBytes <= diskCacheMaxBytes) {
				break
			}
			val fileBytes = entry.bytes
			val deleted = try {
				entry.file.delete()
			} catch (_: Throwable) {
				false
			}
			if (deleted) {
				totalBytes -= fileBytes
			}
		}
	}

	private fun sha256Hex(value: String): String {
		val digest = MessageDigest.getInstance("SHA-256")
		return digest.digest(value.toByteArray(Charsets.UTF_8)).joinToString("") { byte ->
			"%02x".format(byte)
		}
	}

	private fun generateBlurredBytes(originalBytes: ByteArray): ByteArray? {
		return try {
			val original = decodeSampledBitmap(originalBytes, PROCESSING_DECODE_MAX_DIMENSION)
				?: return null
			val w = original.width
			val h = original.height
			val pixels = IntArray(w * h)
			original.getPixels(pixels, 0, w, 0, 0, w, h)
			original.recycle()
			val outPixels = nativeBlurPixels(pixels, w, h, 200, 200) ?: return null
			val blurred = Bitmap.createBitmap(outPixels, 200, 200, Bitmap.Config.ARGB_8888)
			val out = ByteArrayOutputStream()
			blurred.compress(Bitmap.CompressFormat.JPEG, 90, out)
			blurred.recycle()
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
