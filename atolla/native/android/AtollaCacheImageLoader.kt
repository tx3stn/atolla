package atolla.native.android

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.net.Uri
import android.util.LruCache
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
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
import com.snap.valdi.utils.ValdiImageWithBitmap
import com.snap.valdi.utils.ValdiImageWithContent
import com.snap.valdi.utils.ValdiMarshaller
import com.snap.valdi.utils.ValdiVideoLoader
import com.snap.valdi.utils.ValdiVideoPlayer
import com.snap.valdi.utils.ValdiVideoPlayerCreatedCompletion
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
	val sourceTrackId: String?,
	val sourceDurationMs: Long?,
	val nextSourceUrl: String?,
	val nextTrackId: String?,
	val nextDurationMs: Long?,
)

data class QuantizedColorCandidate(
	val b: Int,
	val count: Long,
	val g: Int,
	val r: Int,
)

class AtollaCacheImageLoader : ValdiImageLoader, ValdiVideoLoader {
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
		@Volatile var diskCacheMaxBytes = 200L * 1024 * 1024
		private const val DISK_CACHE_TTL_MS = 30L * 24 * 3600 * 1000

		private val httpClient = OkHttpClient.Builder()
			.protocols(listOf(Protocol.HTTP_2, Protocol.HTTP_1_1))
			.connectTimeout(10, TimeUnit.SECONDS)
			.readTimeout(30, TimeUnit.SECONDS)
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
		// Images served from the memory fast-path are already on the main thread;
		// disk/network paths run on background threads and must post back here.
		private val mainHandler by lazy { Handler(Looper.getMainLooper()) }
		var sharedInstance: AtollaCacheImageLoader? = null
		var imageCachedObserver: ((url: String, category: String) -> Unit)? = null
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

	fun setDiskCacheMaxBytes(bytes: Long) {
		diskCacheMaxBytes = bytes
	}

	fun clearCategories(categories: List<String>) {
		// Keep full-size and thumb variants in sync when clearing categories.
		val expanded = categories.toMutableSet()
		if (expanded.contains("album_art")) expanded.addAll(listOf("album_art_blurred", "album_art_thumb"))
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
		val key = "$category:$sourceUrl"
		val bytes = memory.get(key) ?: readFromDisk(key) ?: return null
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

	fun resolveCachedFileUrl(category: String, sourceUrl: String): String? {
		if (category.isBlank() || sourceUrl.isBlank()) {
			return null
		}

		val key = "$category:$sourceUrl"
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
			val sourceTrackId = url.getQueryParameter("t")
			val sourceDurationMs = url.getQueryParameter("d")?.toLongOrNull()
			val next = url.getQueryParameter("n")
			val nextTrackId = url.getQueryParameter("nt")
			val nextDurationMs = url.getQueryParameter("nd")?.toLongOrNull()
			if (source.isNullOrBlank()) {
				throw ValdiException("Invalid atolla-track video URL")
			}
			return AtollaTrackVideoRequestPayload(
				sourceUrl = source,
				sourceTrackId = sourceTrackId,
				sourceDurationMs = sourceDurationMs,
				nextSourceUrl = next,
				nextTrackId = nextTrackId,
				nextDurationMs = nextDurationMs,
			)
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
		val bitmapPlan = resolveBitmapDecodePlan(key, payload.category, options)
		Log.d(tag, "loadImage key=$key outputType=${options.outputType}")

		// Bitmap cache hit: decoded bitmap is ready — deliver synchronously without
		// dispatching to a background thread, so scrolling back into view is instant.
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
		// calling thread (the UI thread) so there is zero async latency and no blank
		// frame between Valdi clearing the old image and showing the new one.
		// Bitmap decode for a thumbnail is <1ms — preferable to a 16ms blank frame.
		memory.get(key)?.let { bytes ->
			Log.d(tag, "cache hit key=$key bytes=${bytes.size}")
			val image: ValdiImage = when (options.outputType) {
				ValdiAssetLoadOutputType.RAW_CONTENT ->
					ValdiImageWithContent(ValdiImageContent.Bytes(bytes))
				ValdiAssetLoadOutputType.BITMAP -> {
					val bitmap = getOrDecodeBitmap(bytes, bitmapPlan)
					if (bitmap != null) {
						ValdiImageWithBitmap(bitmap)
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

		// Disk fast-path for fixed-size thumbnails: read synchronously on the calling
		// thread (the UI thread) before dispatching to the background executor.
		// Thumbnail files are <100 KB so a sequential read takes well under 1 ms —
		// far cheaper than a mainHandler.post() which costs at least one full frame
		// and is the direct cause of the pop-in on scroll-back when images are
		// already on disk but not yet promoted to the in-memory cache.
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

		val player = AtollaTrackValdiVideoPlayer(
			context,
			payload.sourceUrl,
			payload.sourceTrackId,
			payload.sourceDurationMs,
			payload.nextSourceUrl,
			payload.nextTrackId,
			payload.nextDurationMs,
		)
		completion.onVideoPlayerCreated(player, null)
		return player
	}

	private fun executeLoadImageTask(
		payload: AtollaCacheRequestPayload,
		key: String,
		options: ValdiImageLoadOptions,
		completion: ValdiImageLoadCompletion,
		cancelled: java.util.concurrent.atomic.AtomicBoolean,
		future: CompletableFuture<ByteArray>,
	) {
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

			// Blurred art: generate from the cached original, fetching from
			// network if the original isn't cached yet.
			if (payload.category == "album_art_blurred") {
				val originalKey = "album_art:${payload.sourceUrl}"
				val cachedOriginal = memory.get(originalKey) ?: readFromDisk(originalKey)
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

			if (payload.cacheOnly) {
				inFlight.remove(key)
				val ex = ValdiException("Cache miss for cache-only request")
				future.completeExceptionally(ex)
				deliverOnMain(cancelled) { completion.onImageLoadComplete(0, 0, null, ex) }
				return
			}

			val bytes = fetchBytes(payload.sourceUrl)
			Log.d(tag, "network fetch success key=$key bytes=${bytes.size}")
			memory.put(key, bytes)
			writeToDisk(key, bytes)
			inFlight.remove(key)
			future.complete(bytes)
			completeFromBytes(key, bytes, options, completion, cancelled)
			notifyImageCached(payload.sourceUrl, payload.category)
		} catch (error: Throwable) {
			Log.e(tag, "load failed key=$key", error)
			inFlight.remove(key)
			future.completeExceptionally(error)
			deliverOnMain(cancelled) { completion.onImageLoadComplete(0, 0, null, error) }
		}
	}

	fun preload(sourceUrl: String, category: String) {
		if (sourceUrl.isBlank() || category.isBlank()) {
			return
		}

		val key = "$category:$sourceUrl"
		val bitmapPlan = resolveBitmapDecodePlan(key, category, null)

		// Bitmap already decoded and cached — nothing to do.
		if (bitmapMemory.get(bitmapPlan.bitmapKey) != null) return

		// Bytes in memory but bitmap not yet decoded. Warm the bitmap cache on a
		// background thread so subsequent loadImage calls can serve synchronously.
		memory.get(key)?.let { bytes ->
			if (!inFlight.containsKey(key)) {
				executor.execute(LoadTask(LoadPriority.PREFETCH) {
					warmBitmapCache(key, bytes, category)
				})
			}
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
				executePreloadTask(sourceUrl, category, key, future)
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
				return
			}

			if (category == "album_art_blurred") {
				val originalKey = "album_art:$sourceUrl"
				val cachedOriginal = memory.get(originalKey) ?: readFromDisk(originalKey)
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

	private fun fetchBytes(url: String): ByteArray {
		val request = Request.Builder().url(url).build()
		return httpClient.newCall(request).execute().use { response ->
			if (!response.isSuccessful) {
				throw IOException("HTTP ${response.code}")
			}
			response.body?.bytes() ?: throw IOException("Empty body")
		}
	}

	// Deliver a completion callback on the main thread. When already on the main
	// thread (memory fast-path) the block runs synchronously. When called from a
	// background thread (disk/network path) the block is posted so Valdi can update
	// the image view on the next message-loop iteration.
	// cancelled is re-checked inside the post to handle disposal between the post
	// and execution.
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
					// Best effort disk cleanup.
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
