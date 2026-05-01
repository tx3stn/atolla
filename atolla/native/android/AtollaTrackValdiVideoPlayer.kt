package atolla.native.android

import android.content.Context
import com.tx3stn.atolla.AtollaTrackVideoRequestPayload
import android.os.Handler
import android.os.Looper
import android.view.View
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import com.snap.valdi.callable.safePerform
import com.snap.valdi.utils.Disposable
import com.snap.valdi.utils.ValdiMarshaller
import com.snap.valdi.utils.ValdiVideoPlayer

internal class AtollaTrackValdiVideoPlayer(
	private val context: Context,
	initialSourceUrl: String,
	initialSourceTrackId: String?,
	initialSourceDurationMs: Long?,
	initialNextSourceUrl: String?,
	initialNextTrackId: String?,
	initialNextDurationMs: Long?,
) : ValdiVideoPlayer, Disposable {
	private val mainHandler = Handler(Looper.getMainLooper())
	private val view = View(context)
	private val progressIntervalMs = 250L

	@Volatile private var callbacks: ValdiVideoPlayer.Callbacks? = null
	@Volatile private var disposed = false
	@Volatile private var sourceUrl: String = initialSourceUrl
	@Volatile private var sourceTrackId: String? = initialSourceTrackId
	@Volatile private var sourceDurationMs: Long? = initialSourceDurationMs
	@Volatile private var nextSourceUrl: String? = initialNextSourceUrl
	@Volatile private var nextTrackId: String? = initialNextTrackId
	@Volatile private var nextDurationMs: Long? = initialNextDurationMs
	@Volatile private var playbackRate: Float = 0f
	@Volatile private var volume: Float = 1f
	@Volatile private var pendingSeekToMs: Long? = null

	private var exoPlayer: ExoPlayer? = null
	private var lastPreparedSourceUrl: String? = null
	private var completionNotifiedForSource = false

	private val progressRunnable = object : Runnable {
		override fun run() {
			if (disposed) {
				return
			}

			val player = exoPlayer
			if (player != null) {
				try {
					val positionMs = player.currentPosition.toDouble().coerceAtLeast(0.0)
					val rawDuration = player.duration
					val durationMs = if (rawDuration == C.TIME_UNSET) 0.0 else rawDuration.toDouble().coerceAtLeast(0.0)
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

	private val playerListener = object : Player.Listener {
		override fun onPlaybackStateChanged(playbackState: Int) {
			if (playbackState == Player.STATE_READY) {
				notifyLoadedIfNeeded()
				applySeekIfPending()
				return
			}

			if (playbackState == Player.STATE_ENDED) {
				notifyCompletedOncePerSource()
			}
		}

		override fun onIsPlayingChanged(isPlaying: Boolean) {
			if (!isPlaying) {
				return
			}

			callbacks?.onBeginPlayback?.let { callback ->
				ValdiMarshaller.use { marshaller ->
					callback.safePerform(marshaller)
				}
			}
		}

		override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
			if (reason != Player.MEDIA_ITEM_TRANSITION_REASON_AUTO) {
				return
			}

			notifyCompletedOncePerSource()

			if (mediaItem != null) {
				val mediaId = mediaItem.mediaId
				if (mediaId.isNotBlank()) {
					sourceTrackId = mediaId
				}
				sourceUrl = mediaItem.localConfiguration?.uri?.toString() ?: sourceUrl
			}
			sourceDurationMs = null
			nextSourceUrl = null
			nextTrackId = null
			nextDurationMs = null
			completionNotifiedForSource = false
			lastPreparedSourceUrl = null
			trimPlayedItems()
			notifyLoadedIfNeeded()
		}

		override fun onPlayerError(error: PlaybackException) {
			callbacks?.onError?.let { callback ->
				ValdiMarshaller.use { marshaller ->
					marshaller.pushString(error.message ?: "ExoPlayer playback error")
					callback.safePerform(marshaller)
				}
			}
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

		mainHandler.post {
			if (disposed) {
				return@post
			}

			val currentMediaId = exoPlayer?.currentMediaItem?.mediaId
			val sourceMatchesCurrentTrackId =
				typedPayload.sourceTrackId != null && typedPayload.sourceTrackId == sourceTrackId
			val sourceMatchesCurrentMediaId =
				typedPayload.sourceTrackId != null &&
					!currentMediaId.isNullOrBlank() &&
					currentMediaId == typedPayload.sourceTrackId
			val sourceMatchesCurrentUrl = typedPayload.sourceUrl == sourceUrl
			val sourceUnchanged =
				sourceMatchesCurrentTrackId || sourceMatchesCurrentMediaId || sourceMatchesCurrentUrl
			val nextUnchanged =
				(typedPayload.nextTrackId != null && typedPayload.nextTrackId == nextTrackId) ||
				typedPayload.nextSourceUrl == nextSourceUrl
			val durationsUnchanged =
				typedPayload.sourceDurationMs == sourceDurationMs &&
				typedPayload.nextDurationMs == nextDurationMs
			if (sourceUnchanged && nextUnchanged && durationsUnchanged) {
				return@post
			}

			if (sourceUnchanged) {
				completionNotifiedForSource = false
				sourceTrackId = typedPayload.sourceTrackId ?: sourceTrackId
				sourceDurationMs = typedPayload.sourceDurationMs ?: sourceDurationMs
				nextSourceUrl = typedPayload.nextSourceUrl
				nextTrackId = typedPayload.nextTrackId
				nextDurationMs = typedPayload.nextDurationMs
				syncQueueForCurrentSource()
				return@post
			}

			sourceUrl = typedPayload.sourceUrl
			sourceTrackId = typedPayload.sourceTrackId
			sourceDurationMs = typedPayload.sourceDurationMs
			nextSourceUrl = typedPayload.nextSourceUrl
			nextTrackId = typedPayload.nextTrackId
			nextDurationMs = typedPayload.nextDurationMs

			replacePlaylistForCurrentSource()
		}
	}

	override fun setVolume(volume: Float) {
		this.volume = volume
		mainHandler.post {
			exoPlayer?.volume = volume.coerceIn(0f, 1f)
		}
	}

	override fun setPlaybackRate(rate: Float) {
		playbackRate = rate
		mainHandler.post {
			applyPlaybackRateToPlayer()
		}
	}

	override fun setSeekToTime(time: Float) {
		val seekMs = time.toLong().coerceAtLeast(0L)
		pendingSeekToMs = seekMs
		mainHandler.post {
			applySeekIfPending()
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

		val player = ExoPlayer.Builder(context).build()
		player.addListener(playerListener)
		player.setAudioAttributes(
			AudioAttributes.Builder()
				.setUsage(C.USAGE_MEDIA)
				.setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
				.build(),
			true,
		)
		player.volume = volume.coerceIn(0f, 1f)
		exoPlayer = player

		replacePlaylistForCurrentSource()
	}

	private fun replacePlaylistForCurrentSource() {
		val player = exoPlayer ?: return
		if (sourceUrl.isBlank()) {
			return
		}

		val mediaItems = mutableListOf(buildMediaItem(sourceUrl, sourceTrackId))
		val next = nextSourceUrl
		if (!next.isNullOrBlank() && next != sourceUrl) {
			mediaItems.add(buildMediaItem(next, nextTrackId))
		}

		completionNotifiedForSource = false
		lastPreparedSourceUrl = null
		player.setMediaItems(mediaItems, 0, 0L)

		player.prepare()
		applyPlaybackRateToPlayer()
		applySeekIfPending()
	}

	private fun syncQueueForCurrentSource() {
		val player = exoPlayer ?: return

		val currentItem = player.currentMediaItem
		if (currentItem == null || !mediaItemMatchesSource(currentItem, sourceUrl, sourceTrackId)) {
			replacePlaylistForCurrentSource()
			return
		}

		trimPlayedItems()
		val itemCount = player.mediaItemCount
		if (itemCount > 1) {
			player.removeMediaItems(1, itemCount)
		}

		val next = nextSourceUrl
		if (!next.isNullOrBlank() && next != sourceUrl) {
			player.addMediaItem(buildMediaItem(next, nextTrackId))
		}
	}

	private fun buildMediaItem(url: String, trackId: String?): MediaItem {
		return MediaItem.Builder().setMediaId(trackId ?: url).setUri(url).build()
	}

	private fun mediaItemMatchesSource(item: MediaItem, sourceUrl: String, sourceTrackId: String?): Boolean {
		if (!sourceTrackId.isNullOrBlank() && item.mediaId == sourceTrackId) {
			return true
		}

		val itemUrl = item.localConfiguration?.uri?.toString()
		return itemUrl == sourceUrl
	}

	private fun trimPlayedItems() {
		val player = exoPlayer ?: return
		val currentIndex = player.currentMediaItemIndex
		if (currentIndex > 0) {
			player.removeMediaItems(0, currentIndex)
		}
	}

	private fun applyPlaybackRateToPlayer() {
		val player = exoPlayer ?: return
		if (playbackRate <= 0f) {
			player.playWhenReady = false
			return
		}

		player.setPlaybackParameters(PlaybackParameters(playbackRate))
		player.playWhenReady = true
	}

	private fun applySeekIfPending() {
		val player = exoPlayer ?: return
		val seekMs = pendingSeekToMs ?: return
		try {
			player.seekTo(seekMs)
			pendingSeekToMs = null
		} catch (_: Throwable) {
			// ignored
		}
	}

	private fun notifyLoadedIfNeeded() {
		val player = exoPlayer ?: return
		if (lastPreparedSourceUrl == sourceUrl) {
			return
		}

		lastPreparedSourceUrl = sourceUrl
		val rawDuration = player.duration
		val durationMs = if (rawDuration == C.TIME_UNSET) 0.0 else rawDuration.toDouble().coerceAtLeast(0.0)
		callbacks?.onVideoLoaded?.let { callback ->
			ValdiMarshaller.use { marshaller ->
				marshaller.pushDouble(durationMs)
				callback.safePerform(marshaller)
			}
		}
	}

	private fun notifyCompletedOncePerSource() {
		if (completionNotifiedForSource) {
			return
		}

		completionNotifiedForSource = true
		callbacks?.onCompleted?.let { callback ->
			ValdiMarshaller.use { marshaller ->
				callback.safePerform(marshaller)
			}
		}
	}

	private fun releasePlayer() {
		val player = exoPlayer
		exoPlayer = null
		completionNotifiedForSource = false
		lastPreparedSourceUrl = null
		if (player != null) {
			try {
				player.removeListener(playerListener)
				player.release()
			} catch (_: Throwable) {
				// ignored
			}
		}
	}
}
