package atolla.native.android

import android.app.Notification
import com.tx3stn.atolla.AtollaCacheImageLoader
import com.tx3stn.atolla.AtollaScrobbleNative
import com.tx3stn.atolla.AtollaScrobbleQueue
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
import androidx.media3.common.C
import androidx.media3.common.AudioAttributes
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import com.snap.modules.atolla.TrackPlaybackNativeModule
import com.snap.modules.atolla.TrackPlaybackNativeModuleFactory
import com.snap.valdi.modules.RegisterValdiModule
import java.io.File
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.ArrayDeque
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong

@RegisterValdiModule
class AtollaTrackPlaybackNativeModuleFactory : TrackPlaybackNativeModuleFactory() {
		override fun onLoadModule(): TrackPlaybackNativeModule {
		return object : TrackPlaybackNativeModule {
			override fun cacheAtollaTrackFromUrl(trackId: String, url: String): String {
				return AtollaTrackPlaybackNativeCache.cacheTrackFromUrl(trackId, url, "")
			}

			override fun cacheAtollaTrackFromUrlAsync(trackId: String, url: String, authToken: String, onComplete: (String) -> Unit) {
				Thread {
					val result = try {
						AtollaTrackPlaybackNativeCache.cacheTrackFromUrl(trackId, url, authToken)
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

			override fun cacheAtollaDownloadedTrackFromUrlAsync(trackId: String, url: String, authToken: String, onComplete: (String) -> Unit) {
				Thread {
					val result = try {
						AtollaDownloadedTrackNativeCache.cacheTrackFromUrl(trackId, url, authToken)
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

			override fun configureAtollaAudioPlayback(
				currentSourceUrl: String,
				currentTrackId: String,
				currentDurationMs: Double,
				nextSourceUrl: String,
				nextTrackId: String,
				nextDurationMs: Double,
				allowBackwardRebuild: Boolean,
			) {
				AtollaGaplessAudioEngine.configure(
					currentSourceUrl = currentSourceUrl,
					currentTrackId = currentTrackId,
					currentDurationMs = currentDurationMs.toLong(),
					nextSourceUrl = nextSourceUrl,
					nextTrackId = nextTrackId,
					nextDurationMs = nextDurationMs.toLong(),
					allowBackwardRebuild = allowBackwardRebuild,
				)
			}

			override fun setAtollaAudioPlaybackRate(rate: Double) {
				AtollaGaplessAudioEngine.setPlaybackRate(rate.toFloat())
			}

			override fun setAtollaAudioPlaybackVolume(volume: Double) {
				AtollaGaplessAudioEngine.setVolume(volume.toFloat())
			}

			override fun seekAtollaAudioPlaybackToMs(positionMs: Double) {
				AtollaGaplessAudioEngine.seekTo(positionMs.toLong())
			}

			override fun getAtollaAudioPlaybackPositionMs(): Double {
				return AtollaGaplessAudioEngine.getPositionMs().toDouble()
			}

			override fun getAtollaAudioPlaybackDurationMs(): Double {
				return AtollaGaplessAudioEngine.getDurationMs().toDouble()
			}

			override fun consumeAtollaAudioPlaybackEvent(): String {
				return AtollaGaplessAudioEngine.consumeEvent()
			}

			override fun readAtollaPendingScrobbles(): String {
				return AtollaScrobbleQueue.readPendingJson()
			}

			override fun ackAtollaScrobble(trackId: String, playedAtMs: Double) {
				AtollaScrobbleQueue.ack(trackId, playedAtMs.toLong())
			}

			override fun clearAtollaAudioPlayback() {
				AtollaGaplessAudioEngine.clear()
			}

			override fun getAtollaAudioPlaybackIsActive(): Boolean {
				return AtollaGaplessAudioEngine.isActive()
			}

			override fun getAtollaAudioPlaybackCurrentTrackId(): String {
				return AtollaGaplessAudioEngine.getCurrentTrackId()
			}

			override fun setAtollaAudioPlaybackNextNotification(
				trackName: String,
				artistName: String,
				albumName: String,
				artworkUrl: String,
				durationSeconds: Double,
				hasPrevious: Boolean,
				hasNext: Boolean,
			) {
				AtollaGaplessAudioEngine.setNextNotification(
					trackName = trackName,
					artistName = artistName,
					albumName = albumName,
					artworkUrl = artworkUrl,
					durationSeconds = durationSeconds,
					hasPrevious = hasPrevious,
					hasNext = hasNext,
				)
			}

			override fun setAtollaAudioPlaybackUpcomingQueue(queueJson: String) {
				AtollaGaplessAudioEngine.setUpcomingQueue(queueJson)
			}

			override fun setAtollaTrackPlaybackAuthToken(token: String) {
				AtollaTrackPlaybackMediaSession.authToken = token.ifBlank { null }
			}

		}
	}
}

object AtollaGaplessAudioEngine {
	private const val tag = "AtollaGaplessAudio"
	private val mainHandler = Handler(Looper.getMainLooper())
	private val eventQueue = ArrayDeque<String>()

	@Volatile private var sourceUrl: String = ""
	@Volatile private var sourceTrackId: String = ""
	@Volatile private var sourceDurationMs: Long = 0L
	@Volatile private var nextSourceUrl: String = ""
	@Volatile private var nextTrackId: String = ""
	@Volatile private var nextDurationMs: Long = 0L
	@Volatile private var playbackRate: Float = 0f
	@Volatile private var volume: Float = 1f
	@Volatile private var pendingSeekToMs: Long? = null
	// maintained by onIsPlayingChanged so isActive() never needs a main-thread round trip; the
	// previous 50ms latch read returned false under main-thread load, making the JS queue
	// restore believe playback was inactive while audio was audibly playing
	@Volatile private var isPlayingNow: Boolean = false

	// set just before an engine-initiated seekToNextMediaItem / seekToPreviousMediaItem so the
	// resulting SEEK-reason transition is classified as an advance or step-back (event +
	// window maintenance + notification) rather than ignored
	@Volatile private var expectingNativeSkip: Boolean = false
	@Volatile private var expectingNativeStepBack: Boolean = false

	// scrobble threshold: a track left after this fraction of its duration counts as played (a
	// natural end always counts). the played? decision runs in shared Zig via AtollaScrobbleNative,
	// evaluated at the discrete points a track ends or is left — so it works while the JS runtime is
	// frozen in the background — and a durable line is appended to AtollaScrobbleQueue for JS to send.
	private const val scrobbleThresholdRatio = 0.8f

	@Volatile private var nextNotificationTrackName: String = ""
	@Volatile private var nextNotificationArtistName: String = ""
	@Volatile private var nextNotificationAlbumName: String = ""
	@Volatile private var nextNotificationArtworkUrl: String = ""
	@Volatile private var nextNotificationDurationSeconds: Double = 0.0
	@Volatile private var nextNotificationHasPrevious: Boolean = false
	@Volatile private var nextNotificationHasNext: Boolean = false

	private data class WindowTrack(
		val sourceUrl: String,
		val trackId: String,
		val durationMs: Long,
		val trackName: String,
		val artistName: String,
		val albumName: String,
		val artworkUrl: String,
		val durationSeconds: Double,
		val hasPrevious: Boolean,
		val hasNext: Boolean,
	)

	// ordered window of the play queue around the current track ([history..., current,
	// upcoming...]). lets the engine keep topping up the ExoPlayer queue at each transition,
	// forwards for gapless auto-advance and backwards for the previous button, so background
	// playback survives multiple track boundaries while the JS runtime (and its 200ms event
	// poll) is frozen. immutable list, swapped as a whole so the main thread always reads a
	// consistent snapshot. windowAnchorHint is the engine's running cursor for the current
	// track's position in the window: payload currentIndex on refresh, shifted per transition,
	// re-verified against trackIds by resolveWindowAnchor before every use
	@Volatile private var queueWindow: List<WindowTrack> = emptyList()
	@Volatile private var windowAnchorHint: Int = 0
	private const val lookaheadTargetAhead = 2
	private const val historyTargetBehind = 10

	// while a freshly-started remote track is filling its initial network buffer, hold back the
	// gapless next item / lookahead top-up so they don't compete for bandwidth and stutter the
	// start of playback. cleared (and the lookahead attached) once the current item reaches
	// STATE_READY. see AtollaPlaybackGuards.shouldDeferLookaheadForSource
	@Volatile private var suppressLookahead: Boolean = false

	private var exoPlayer: ExoPlayer? = null

	private val playerListener = object : Player.Listener {
		override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
			if (playWhenReady) {
				return
			}

			val emitPause = AtollaPlaybackGuards.shouldEmitPauseForReason(reason)
			Log.d(tag, "onPlayWhenReadyChanged playWhenReady=$playWhenReady reason=$reason emitPause=$emitPause")
			if (emitPause) {
				enqueueEvent("pause-requested")
			}
		}

		override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
			// captured before shouldClearTransitionExpectation() clears it: distinguishes a user
			// "next" (handled at the leave point) from a genuine auto-advance (natural end)
			val wasUserSkip = expectingNativeSkip
			val kind = AtollaPlaybackGuards.classifyTransition(
				reason,
				expectingNativeSkip = expectingNativeSkip,
				expectingNativeStepBack = expectingNativeStepBack,
			)
			if (AtollaPlaybackGuards.shouldClearTransitionExpectation(reason)) {
				expectingNativeSkip = false
				expectingNativeStepBack = false
			}
			if (kind == AtollaPlaybackGuards.TransitionKind.IGNORE) {
				Log.d(tag, "onMediaItemTransition skipped reason=$reason")
				return
			}

			val finishedTrackId = sourceTrackId
			Log.d(tag, "onMediaItemTransition $kind trackId=${mediaItem?.mediaId} finished=$finishedTrackId reason=$reason")
			if (kind == AtollaPlaybackGuards.TransitionKind.ADVANCE) {
				// an auto-advance means the finished track played to its natural end and counts as
				// played; a user "next" is instead handled at its leave point (handleMediaAction /
				// configure) so a skip before the end does not force a scrobble
				if (!wasUserSkip) {
					maybeAppendScrobble(finishedTrackId, 0L, 0L, isNaturalEnd = true)
				}
				// carry the finished trackId so JS can reconcile deterministically after being
				// frozen across several transitions (it advances past the last finished id
				// rather than counting events)
				enqueueEvent(if (finishedTrackId.isBlank()) "completed" else "completed:$finishedTrackId")
			}
			if (mediaItem != null) {
				sourceTrackId = mediaItem.mediaId
				sourceUrl = mediaItem.localConfiguration?.uri?.toString() ?: sourceUrl
			}
			sourceDurationMs = 0L
			nextSourceUrl = ""
			nextTrackId = ""
			nextDurationMs = 0L
			// any unapplied seek belonged to the track we just left; applying it to
			// the new track would jump playback to an arbitrary position
			pendingSeekToMs = null
			if (kind == AtollaPlaybackGuards.TransitionKind.ADVANCE) {
				windowAnchorHint += 1
			} else {
				windowAnchorHint = (windowAnchorHint - 1).coerceAtLeast(0)
				// tells JS which track is now current so the store can move backwards too
				if (sourceTrackId.isNotBlank()) {
					enqueueEvent("jumped:$sourceTrackId")
				}
			}
			trimExcessHistory()
			exoPlayer?.let { ensureWindow(it) }

			val trackName = nextNotificationTrackName
			val artistName = nextNotificationArtistName
			val albumName = nextNotificationAlbumName
			val artworkUrl = nextNotificationArtworkUrl
			val durationSeconds = nextNotificationDurationSeconds
			val hasPrevious = nextNotificationHasPrevious
			val hasNext = nextNotificationHasNext
			nextNotificationTrackName = ""
			nextNotificationArtistName = ""
			nextNotificationAlbumName = ""
			nextNotificationArtworkUrl = ""
			nextNotificationDurationSeconds = 0.0
			nextNotificationHasPrevious = false
			nextNotificationHasNext = false

			val windowEntry = currentWindowEntry()
			val isPlayingState = exoPlayer?.playWhenReady ?: true
			if (windowEntry != null) {
				sourceDurationMs = windowEntry.durationMs.coerceAtLeast(0L)
				AtollaTrackPlaybackMediaSession.updateNotification(
					trackName = windowEntry.trackName,
					artistName = windowEntry.artistName,
					albumName = windowEntry.albumName,
					artworkUrl = windowEntry.artworkUrl,
					isPlaying = isPlayingState,
					positionSeconds = 0.0,
					durationSeconds = windowEntry.durationSeconds,
					hasPrevious = windowEntry.hasPrevious,
					hasNext = windowEntry.hasNext,
				)
			} else if (trackName.isNotBlank()) {
				AtollaTrackPlaybackMediaSession.updateNotification(
					trackName = trackName,
					artistName = artistName,
					albumName = albumName,
					artworkUrl = artworkUrl,
					isPlaying = isPlayingState,
					positionSeconds = 0.0,
					durationSeconds = durationSeconds,
					hasPrevious = hasPrevious,
					hasNext = hasNext,
				)
			}
		}

		override fun onPlaybackStateChanged(playbackState: Int) {
			if (playbackState == Player.STATE_READY) {
				enqueueEvent("loaded")
				applyPendingSeekIfNeeded()
				// the current track is buffered and playing now, so it's safe to attach the
				// gapless next item / lookahead that was held back during the initial buffer
				if (suppressLookahead) {
					suppressLookahead = false
					exoPlayer?.let { attachLookahead(it) }
				}
				return
			}

			if (playbackState == Player.STATE_ENDED) {
				val endedTrackId = sourceTrackId
				// end of the queue: the current track played to its natural end
				maybeAppendScrobble(endedTrackId, 0L, 0L, isNaturalEnd = true)
				enqueueEvent(if (endedTrackId.isBlank()) "completed" else "completed:$endedTrackId")
			}
		}

		override fun onIsPlayingChanged(isPlaying: Boolean) {
			isPlayingNow = isPlaying
		}

		override fun onPlayerError(error: PlaybackException) {
			enqueueEvent("error:${error.message ?: "ExoPlayer playback error"}")
		}
	}

	fun configure(
		currentSourceUrl: String,
		currentTrackId: String,
		currentDurationMs: Long,
		nextSourceUrl: String,
		nextTrackId: String,
		nextDurationMs: Long,
		allowBackwardRebuild: Boolean = false,
	) {
		Log.d(tag, "configure trackId=$currentTrackId rate=$playbackRate hasNext=${nextSourceUrl.isNotBlank()} allowBackward=$allowBackwardRebuild thread=${Thread.currentThread().name}")
		// an in-app track change (skip / jump / new album) leaves the current track; count it if it
		// was played far enough. a native auto-advance already advanced sourceTrackId, so there
		// currentTrackId == sourceTrackId and this is skipped (the natural-end path handled it).
		val leavingTrackId = sourceTrackId
		val leavingDurationMs = sourceDurationMs
		if (leavingTrackId.isNotBlank() && leavingTrackId != currentTrackId) {
			mainHandler.post {
				val player = exoPlayer ?: return@post
				// only while the player is still on the leaving track (guards a race with a native
				// advance) and before the queued syncQueue() rebuild moves it on
				if (player.currentMediaItem?.mediaId == leavingTrackId) {
					maybeAppendScrobble(
						leavingTrackId,
						player.currentPosition.coerceAtLeast(0L),
						leavingDurationMs,
						isNaturalEnd = false,
					)
				}
			}
		}
		this.sourceUrl = currentSourceUrl
		this.sourceTrackId = currentTrackId
		this.sourceDurationMs = currentDurationMs.coerceAtLeast(0L)
		this.nextSourceUrl = nextSourceUrl
		this.nextTrackId = nextTrackId
		this.nextDurationMs = nextDurationMs.coerceAtLeast(0L)

		val capturedSourceUrl = currentSourceUrl
		// snapshot playbackRate now so the posted lambda uses the rate that was current when
		// this configure() was called. without a snapshot, the restore's lambda (posted with
		// playbackRate=0) can read playbackRate=1 at execution time, after the user's
		// setPlaybackRate(1) has already run on the JS thread, and mistakenly set
		// playWhenReady=true on the stale/expired restored URL before ExoPlayer can load it
		val capturedPlaybackRate = playbackRate
		mainHandler.post {
			val player = ensurePlayer() ?: return@post
			// a newer configure() call has already updated sourceUrl; its own lambda will run
			// syncQueue() for the correct media. running here would call replaceQueue() with
			// playWhenReady=true against the stale/expired URL and trigger an error + rapid
			// reconfigure cycle that crashes ExoPlayer on some Android versions
			if (sourceUrl != capturedSourceUrl) {
				return@post
			}
			syncQueue(player, capturedPlaybackRate, allowBackwardRebuild)
		}
	}

	fun setPlaybackRate(rate: Float) {
		playbackRate = rate
		val capturedSourceUrl = sourceUrl
		mainHandler.post {
			val player = ensurePlayer() ?: return@post
			if (playbackRate <= 0f) {
				player.playWhenReady = false
				return@post
			}
			// if source changed since this call was made, configure()'s replaceQueue()
			// will set playWhenReady once the correct media is loaded. avoid touching
			// the player here so we don't start streaming a stale/expired URL
			if (sourceUrl != capturedSourceUrl) {
				return@post
			}
			player.setPlaybackParameters(PlaybackParameters(playbackRate))
			// playWhenReady = true is a no-op once the player has reached STATE_ENDED
			// (e.g. after an offline gapless transition reached end-of-queue). Seek back
			// into the item first so the resume actually starts audio, otherwise the JS
			// store shows "playing" but nothing plays until the user manually seeks
			if (AtollaPlaybackGuards.shouldSeekToRecoverEndedState(player.playbackState)) {
				player.seekToDefaultPosition()
			}
			// an errored player parks in STATE_IDLE where playWhenReady is equally a no-op
			// without re-preparing the current media items
			if (AtollaPlaybackGuards.shouldPrepareBeforeResume(player.playbackState)) {
				player.prepare()
			}
			player.playWhenReady = true
		}
	}

	fun setVolume(volume: Float) {
		this.volume = volume
		mainHandler.post {
			val player = ensurePlayer() ?: return@post
			player.volume = this.volume.coerceIn(0f, 1f)
		}
	}

	fun seekTo(positionMs: Long) {
		pendingSeekToMs = positionMs.coerceAtLeast(0L)
		mainHandler.post {
			applyPendingSeekIfNeeded()
		}
	}

	fun getPositionMs(): Long {
		return runOnMainSync(0L) {
			val player = exoPlayer ?: return@runOnMainSync 0L
			try {
				player.currentPosition.coerceAtLeast(0L)
			} catch (_: Throwable) {
				0L
			}
		}
	}

	fun getDurationMs(): Long {
		return runOnMainSync(0L) {
			val player = exoPlayer ?: return@runOnMainSync 0L
			try {
				val duration = player.duration
				if (duration == C.TIME_UNSET) 0L else duration.coerceAtLeast(0L)
			} catch (_: Throwable) {
				0L
			}
		}
	}

	fun isActive(): Boolean {
		return isPlayingNow
	}

	// reads the @Volatile field directly (like isActive), no main-thread hop
	fun getCurrentTrackId(): String {
		return sourceTrackId
	}

	fun setNextNotification(
		trackName: String,
		artistName: String,
		albumName: String,
		artworkUrl: String,
		durationSeconds: Double,
		hasPrevious: Boolean,
		hasNext: Boolean,
	) {
		nextNotificationTrackName = trackName
		nextNotificationArtistName = artistName
		nextNotificationAlbumName = albumName
		nextNotificationArtworkUrl = artworkUrl
		nextNotificationDurationSeconds = durationSeconds
		nextNotificationHasPrevious = hasPrevious
		nextNotificationHasNext = hasNext
	}

	// applies a media-session/notification transport action directly to the player so the
	// controls stay responsive while the JS runtime is frozen. the store reconciles afterwards
	// through the engine event queue (play/pause-requested, and the skip's completed:<trackId>
	// from the resulting transition)
	fun handleMediaAction(action: String) {
		Log.d(tag, "handleMediaAction action=$action")
		mainHandler.post {
			val player = exoPlayer ?: return@post
			when (action) {
				"play" -> {
					if (playbackRate <= 0f) {
						playbackRate = 1f
					}
					player.setPlaybackParameters(PlaybackParameters(playbackRate))
					if (AtollaPlaybackGuards.shouldSeekToRecoverEndedState(player.playbackState)) {
						player.seekToDefaultPosition()
					}
					if (AtollaPlaybackGuards.shouldPrepareBeforeResume(player.playbackState)) {
						player.prepare()
					}
					player.playWhenReady = true
					enqueueEvent("play-requested")
					AtollaTrackPlaybackMediaSession.setPlaybackActive(
						isPlaying = true,
						positionSeconds = player.currentPosition.coerceAtLeast(0L) / 1000.0,
					)
				}
				"pause" -> {
					player.playWhenReady = false
					enqueueEvent("pause-requested")
					AtollaTrackPlaybackMediaSession.setPlaybackActive(
						isPlaying = false,
						positionSeconds = player.currentPosition.coerceAtLeast(0L) / 1000.0,
					)
				}
				"next" -> {
					if (player.hasNextMediaItem()) {
						// count the leaving track before skipping past it (position lost after)
						maybeAppendScrobble(
							sourceTrackId,
							player.currentPosition.coerceAtLeast(0L),
							sourceDurationMs,
							isNaturalEnd = false,
						)
						expectingNativeSkip = true
						player.seekToNextMediaItem()
					}
				}
				"previous" -> {
					val positionMs = player.currentPosition.coerceAtLeast(0L)
					if (AtollaPlaybackGuards.shouldRestartForPreviousAction(positionMs, player.hasPreviousMediaItem())) {
						player.seekToDefaultPosition()
						AtollaTrackPlaybackMediaSession.setPlaybackActive(
							isPlaying = player.playWhenReady,
							positionSeconds = 0.0,
						)
					} else {
						maybeAppendScrobble(sourceTrackId, positionMs, sourceDurationMs, isNaturalEnd = false)
						expectingNativeStepBack = true
						player.seekToPreviousMediaItem()
					}
				}
			}
		}
	}

	fun setUpcomingQueue(queueJson: String) {
		val (entries, currentIndex) = parseQueueWindow(queueJson)
		queueWindow = entries
		windowAnchorHint = currentIndex
		Log.d(tag, "setUpcomingQueue size=${entries.size} currentIndex=$currentIndex")
		mainHandler.post {
			val player = exoPlayer ?: return@post
			ensureWindow(player)
		}
	}

	private fun parseQueueWindow(queueJson: String): Pair<List<WindowTrack>, Int> {
		if (queueJson.isBlank()) {
			return Pair(emptyList(), 0)
		}

		return try {
			val root = org.json.JSONObject(queueJson)
			val entriesJson = root.optJSONArray("entries") ?: return Pair(emptyList(), 0)
			val currentIndex = root.optInt("currentIndex", 0)
			val entries = mutableListOf<WindowTrack>()
			for (index in 0 until entriesJson.length()) {
				// bail on malformed entries rather than skipping them: currentIndex is
				// positional, so dropping an entry would misalign the whole window
				val entry = entriesJson.optJSONObject(index) ?: return Pair(emptyList(), 0)
				val trackId = entry.optString("trackId", "")
				if (trackId.isBlank()) {
					return Pair(emptyList(), 0)
				}
				entries.add(
					WindowTrack(
						sourceUrl = entry.optString("sourceUrl", ""),
						trackId = trackId,
						durationMs = entry.optLong("durationMs", 0L),
						trackName = entry.optString("trackName", ""),
						artistName = entry.optString("artistName", ""),
						albumName = entry.optString("albumName", ""),
						artworkUrl = entry.optString("artworkUrl", ""),
						durationSeconds = entry.optDouble("durationSeconds", 0.0),
						hasPrevious = entry.optBoolean("hasPrevious", false),
						hasNext = entry.optBoolean("hasNext", false),
					),
				)
			}
			Pair(entries, currentIndex)
		} catch (error: Throwable) {
			Log.e(tag, "Failed to parse queue window", error)
			Pair(emptyList(), 0)
		}
	}

	// the window entry describing the track the player is currently on, or null when the
	// window doesn't know it. also re-anchors windowAnchorHint as a side effect
	private fun currentWindowEntry(): WindowTrack? {
		val window = queueWindow
		if (window.isEmpty()) {
			return null
		}
		val anchor = AtollaPlaybackGuards.resolveWindowAnchor(
			window.map { it.trackId },
			windowAnchorHint,
			sourceTrackId,
		)
		if (anchor < 0) {
			return null
		}
		windowAnchorHint = anchor
		return window[anchor]
	}

	// aligns the ExoPlayer queue with the window around the current item: drops queued items
	// that diverge from the window order (queue was reordered/edited), tops up to
	// lookaheadTargetAhead items ahead for gapless auto-advance, and backfills up to
	// historyTargetBehind items behind so the previous button can step back natively.
	// main thread only
	private fun ensureWindow(player: ExoPlayer) {
		val window = queueWindow
		if (window.isEmpty()) {
			return
		}
		val windowIds = window.map { it.trackId }
		val anchor = AtollaPlaybackGuards.resolveWindowAnchor(windowIds, windowAnchorHint, sourceTrackId)
		if (anchor < 0) {
			return
		}
		windowAnchorHint = anchor

		val currentIndex = player.currentMediaItemIndex
		if (currentIndex < 0 || currentIndex >= player.mediaItemCount) {
			return
		}

		// drop forward items from the first divergence from the window order
		var offset = 1
		while (currentIndex + offset < player.mediaItemCount) {
			val expectedId = windowIds.getOrNull(anchor + offset)
			val queuedId = player.getMediaItemAt(currentIndex + offset).mediaId
			if (expectedId == null || expectedId != queuedId) {
				Log.d(tag, "ensureWindow drop ahead from offset=$offset queuedId=$queuedId")
				player.removeMediaItems(currentIndex + offset, player.mediaItemCount)
				break
			}
			offset += 1
		}

		// drop history items once they diverge (walking backwards from current)
		offset = 1
		while (currentIndex - offset >= 0) {
			val expectedId = windowIds.getOrNull(anchor - offset)
			val queuedId = player.getMediaItemAt(currentIndex - offset).mediaId
			if (expectedId == null || expectedId != queuedId) {
				Log.d(tag, "ensureWindow drop history up to offset=$offset queuedId=$queuedId")
				player.removeMediaItems(0, currentIndex - offset + 1)
				break
			}
			offset += 1
		}

		// top up ahead for gapless auto-advance, unless the lookahead is held back while the
		// current remote track fills its initial buffer (see replaceQueue / suppressLookahead)
		while (!suppressLookahead) {
			val nowCurrent = player.currentMediaItemIndex
			val ahead = player.mediaItemCount - 1 - nowCurrent
			if (ahead >= lookaheadTargetAhead) {
				break
			}
			val entry = window.getOrNull(anchor + ahead + 1) ?: break
			if (entry.sourceUrl.isBlank()) {
				break
			}
			Log.d(tag, "ensureWindow append trackId=${entry.trackId}")
			player.addMediaItem(buildMediaItem(entry.sourceUrl, entry.trackId))
		}

		// backfill history behind for native previous
		while (true) {
			val behind = player.currentMediaItemIndex
			if (behind >= historyTargetBehind) {
				break
			}
			val entry = window.getOrNull(anchor - behind - 1) ?: break
			if (entry.sourceUrl.isBlank()) {
				break
			}
			Log.d(tag, "ensureWindow backfill trackId=${entry.trackId}")
			player.addMediaItem(0, buildMediaItem(entry.sourceUrl, entry.trackId))
		}
	}

	fun consumeEvent(): String {
		synchronized(eventQueue) {
			return if (eventQueue.isEmpty()) "" else eventQueue.removeFirst()
		}
	}

	fun clear() {
		sourceUrl = ""
		sourceTrackId = ""
		sourceDurationMs = 0L
		nextSourceUrl = ""
		nextTrackId = ""
		nextDurationMs = 0L
		pendingSeekToMs = null
		queueWindow = emptyList()
		windowAnchorHint = 0
		suppressLookahead = false
		expectingNativeSkip = false
		expectingNativeStepBack = false
		synchronized(eventQueue) {
			eventQueue.clear()
		}

		mainHandler.post {
			releasePlayer()
		}
	}

	private fun ensurePlayer(): ExoPlayer? {
		if (sourceUrl.isBlank()) {
			return exoPlayer
		}

		val existing = exoPlayer
		if (existing != null) {
			return existing
		}

		val appContext = resolveApplicationContext() ?: run {
			Log.e(tag, "Unable to resolve application context for audio playback")
			return null
		}

		val player = ExoPlayer.Builder(appContext).build()
		val audioAttributes = AudioAttributes.Builder()
			.setUsage(C.USAGE_MEDIA)
			.setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
			.build()
		player.setAudioAttributes(audioAttributes, true)
		player.setWakeMode(C.WAKE_MODE_NETWORK)
		player.setHandleAudioBecomingNoisy(true)
		player.addListener(playerListener)
		player.volume = volume.coerceIn(0f, 1f)
		exoPlayer = player
		return player
	}

	private fun syncQueue(
		player: ExoPlayer,
		capturedPlaybackRate: Float = playbackRate,
		allowBackwardRebuild: Boolean = false,
	) {
		if (sourceUrl.isBlank()) {
			return
		}

		val currentItem = player.currentMediaItem
		val currentItemMatches = currentItem != null && mediaItemMatches(currentItem, sourceUrl, sourceTrackId)
		val isEnded = player.playbackState == AtollaPlaybackGuards.STATE_ENDED
		val isIdle = player.playbackState == AtollaPlaybackGuards.STATE_IDLE
		// take the fast-path (only update the gapless next item) only when the current item
		// matches and the player isn't ended/idle. if the player ended on this item (offline
		// transition reached end-of-queue) or errored into idle, we must re-prepare it via
		// replaceQueue, otherwise it would keep matching forever and never resume
		if (AtollaPlaybackGuards.shouldRebuildQueueForState(isEnded, isIdle, currentItemMatches)) {
			// a pure source-mismatch rebuild during a wake race can yank a playing engine back to
			// a stale earlier track. suppress it and let JS reconcile forward; ended/idle still
			// rebuild (they need a re-prepare)
			if (!isEnded && !isIdle) {
				val windowIds = queueWindow.map { it.trackId }
				val currentAnchor = AtollaPlaybackGuards.resolveWindowAnchor(
					windowIds,
					windowAnchorHint,
					currentItem?.mediaId ?: "",
				)
				val requestedAnchor = AtollaPlaybackGuards.resolveWindowAnchor(windowIds, windowAnchorHint, sourceTrackId)
				if (AtollaPlaybackGuards.shouldSuppressBackwardRebuild(isPlayingNow, requestedAnchor, currentAnchor, allowBackwardRebuild)) {
					Log.d(tag, "syncQueue: suppress backward rebuild requested=$requestedAnchor current=$currentAnchor trackId=$sourceTrackId")
					// configure() already overwrote the source fields with the stale request;
					// realign them to the item actually playing so getCurrentTrackId() and
					// ensureWindow's anchor stay truthful (otherwise JS would re-reconcile backward)
					sourceTrackId = currentItem?.mediaId ?: sourceTrackId
					currentItem?.localConfiguration?.uri?.toString()?.let { sourceUrl = it }
					ensureWindow(player)
					return
				}
			}
			Log.d(tag, "syncQueue->replaceQueue: rebuild trackId=$sourceTrackId rate=$capturedPlaybackRate ended=$isEnded idle=$isIdle matches=$currentItemMatches")
			replaceQueue(player, capturedPlaybackRate)
			return
		}

		Log.d(tag, "syncQueue: updating next item trackId=$sourceTrackId hasNext=${nextSourceUrl.isNotBlank()}")
		trimExcessHistory()
		val currentIndex = player.currentMediaItemIndex
		if (currentIndex >= 0 && currentIndex + 1 < player.mediaItemCount) {
			player.removeMediaItems(currentIndex + 1, player.mediaItemCount)
		}

		if (!suppressLookahead && nextSourceUrl.isNotBlank() && nextSourceUrl != sourceUrl) {
			player.addMediaItem(buildMediaItem(nextSourceUrl, nextTrackId))
		}
		ensureWindow(player)
	}

	private fun replaceQueue(player: ExoPlayer, capturedPlaybackRate: Float = playbackRate) {
		if (sourceUrl.isBlank()) {
			return
		}

		// a streamed current track must fill its initial network buffer alone; adding the
		// gapless next item here makes ExoPlayer pre-buffer it in parallel and stutters the
		// start, so hold the lookahead back until STATE_READY (see onPlaybackStateChanged)
		suppressLookahead = AtollaPlaybackGuards.shouldDeferLookaheadForSource(sourceUrl)

		Log.d(tag, "replaceQueue trackId=$sourceTrackId rate=$capturedPlaybackRate pendingSeek=$pendingSeekToMs suppressLookahead=$suppressLookahead")
		val items = mutableListOf(buildMediaItem(sourceUrl, sourceTrackId))
		if (!suppressLookahead && nextSourceUrl.isNotBlank() && nextSourceUrl != sourceUrl) {
			items.add(buildMediaItem(nextSourceUrl, nextTrackId))
		}

		player.setMediaItems(items, 0, 0L)
		player.prepare()
		ensureWindow(player)
		if (capturedPlaybackRate > 0f) {
			player.setPlaybackParameters(PlaybackParameters(capturedPlaybackRate))
			player.playWhenReady = true
		} else {
			player.playWhenReady = false
		}
		applyPendingSeekIfNeeded()
	}

	// attaches the gapless next item and tops up the lookahead window after the initial
	// suppression while a streamed track filled its first buffer. mirrors the syncQueue
	// fast-path tail. main thread only
	private fun attachLookahead(player: ExoPlayer) {
		val currentIndex = player.currentMediaItemIndex
		if (currentIndex >= 0 && currentIndex + 1 < player.mediaItemCount) {
			player.removeMediaItems(currentIndex + 1, player.mediaItemCount)
		}
		if (nextSourceUrl.isNotBlank() && nextSourceUrl != sourceUrl) {
			player.addMediaItem(buildMediaItem(nextSourceUrl, nextTrackId))
		}
		ensureWindow(player)
	}

	private fun buildMediaItem(url: String, trackId: String): MediaItem {
		return MediaItem.Builder()
			.setMediaId(if (trackId.isBlank()) url else trackId)
			.setUri(url)
			.build()
	}

	private fun mediaItemMatches(item: MediaItem, expectedUrl: String, expectedTrackId: String): Boolean =
		AtollaPlaybackGuards.currentItemMatches(
			loadedTrackId = item.mediaId,
			requestedTrackId = expectedTrackId,
			loadedSourceUrl = item.localConfiguration?.uri?.toString() ?: "",
			requestedSourceUrl = expectedUrl,
		)

	private fun applyPendingSeekIfNeeded() {
		val player = exoPlayer ?: return
		val seekMs = pendingSeekToMs ?: return
		try {
			player.seekTo(seekMs)
			pendingSeekToMs = null
		} catch (_: Throwable) {
			// best effort
		}
	}

	// keeps at most historyTargetBehind played items in the queue so the previous button can
	// step back natively without the queue growing unbounded
	private fun trimExcessHistory() {
		val player = exoPlayer ?: return
		val excess = player.currentMediaItemIndex - historyTargetBehind
		if (excess > 0) {
			player.removeMediaItems(0, excess)
		}
	}

	private fun enqueueEvent(event: String) {
		synchronized(eventQueue) {
			// sized for long screen-off sessions where every transition queues a completed
			// event that JS only drains on wake
			if (eventQueue.size >= 128) {
				eventQueue.removeFirst()
			}
			eventQueue.addLast(event)
		}
	}

	// evaluate the shared "played?" rule for a track being left or ended and, when it counts, append
	// a durable pending scrobble for JS to deliver
	private fun maybeAppendScrobble(
		trackId: String,
		positionMs: Long,
		durationMs: Long,
		isNaturalEnd: Boolean,
	) {
		if (trackId.isBlank()) return
		val counts = try {
			AtollaScrobbleNative.shouldCount(positionMs, durationMs, scrobbleThresholdRatio, isNaturalEnd)
		} catch (error: Throwable) {
			Log.e(tag, "scrobble decision failed", error)
			return
		}
		if (counts) {
			AtollaScrobbleQueue.append(trackId, System.currentTimeMillis())
		}
	}

	private fun resolveApplicationContext(): Context? {
		return try {
			val activityThreadClass = Class.forName("android.app.ActivityThread")
			val currentApplication = activityThreadClass.getMethod("currentApplication").invoke(null)
			val app = currentApplication as? android.app.Application ?: return null
			app.applicationContext
		} catch (error: Throwable) {
			Log.e(tag, "Unable to resolve application context", error)
			null
		}
	}

	private fun releasePlayer() {
		val player = exoPlayer
		exoPlayer = null
		isPlayingNow = false
		if (player != null) {
			try {
				player.removeListener(playerListener)
				player.release()
			} catch (_: Throwable) {
				// ignored
			}
		}
	}

	private fun <T> runOnMainSync(defaultValue: T, block: () -> T): T {
		if (Looper.myLooper() == Looper.getMainLooper()) {
			return try {
				block()
			} catch (_: Throwable) {
				defaultValue
			}
		}

		val latch = CountDownLatch(1)
		var result = defaultValue
		mainHandler.post {
			result = try {
				block()
			} catch (_: Throwable) {
				defaultValue
			}
			latch.countDown()
		}

		try {
			latch.await(50, TimeUnit.MILLISECONDS)
		} catch (_: Throwable) {
			return defaultValue
		}

		return result
	}
}

private const val maxDownloadRedirects = 5

// the token belongs to the configured server, so only carry it on redirects that stay on that
// host. a hop to a different host (a CDN, or a hostile redirect) or a downgrade to http would
// leak it, so those go out unauthenticated instead
private fun redirectKeepsAuth(server: URL, target: URL): Boolean {
	if (!server.host.equals(target.host, ignoreCase = true)) {
		return false
	}
	val isDowngrade = server.protocol.equals("https", ignoreCase = true) &&
		target.protocol.equals("http", ignoreCase = true)
	return !isDowngrade
}

private fun openAuthedConnectionFollowingRedirects(
	rawUrl: String,
	authToken: String?,
	accept: String,
): HttpURLConnection {
	val token = authToken
	val serverOrigin = URL(rawUrl)
	var current = serverOrigin
	var redirectCount = 0
	while (true) {
		val connection = (current.openConnection() as HttpURLConnection).apply {
			connectTimeout = 10_000
			readTimeout = 20_000
			instanceFollowRedirects = false
			requestMethod = "GET"
			setRequestProperty("Accept", accept)
			if (token != null && token.isNotBlank() && redirectKeepsAuth(serverOrigin, current)) {
				setRequestProperty("X-Emby-Token", token)
				setRequestProperty("Authorization", "MediaBrowser Token=\"$token\"")
			}
		}
		val status = connection.responseCode
		if (status in 300..399 && redirectCount < maxDownloadRedirects) {
			val location = connection.getHeaderField("Location")
			connection.disconnect()
			if (location.isNullOrBlank()) {
				throw IOException("Download redirect missing Location header")
			}
			current = URL(current, location)
			redirectCount++
			continue
		}
		return connection
	}
}

object AtollaTrackPlaybackNativeCache {
	private const val tag = "AtollaTrackCache"
	private const val cacheFolder = "atolla-track-cache"
	private const val defaultMaxTracks = 20

	@Volatile
	private var cacheMaxTracks = defaultMaxTracks

	// tracks which safeKeys are currently downloading to prevent duplicate concurrent
	// downloads writing to the same temp file
	private val inProgressKeys = java.util.Collections.synchronizedSet(mutableSetOf<String>())

	fun cacheTrackFromUrl(trackId: String, url: String, authToken: String): String {
		if (trackId.isBlank() || url.isBlank()) {
			return ""
		}

		// only HTTP(S) sources are downloadable here; a local file:// (already-cached/offline) url
		// would throw when cast to HttpURLConnection below, so treat it as nothing to download
		if (!url.startsWith("http://", ignoreCase = true) && !url.startsWith("https://", ignoreCase = true)) {
			return ""
		}

		val cacheDir = resolveCacheDir() ?: return ""
		val safeKey = safeTrackKey(trackId)

		// check cache and clean up any stale files while holding the lock. stale cleanup must
		// happen here (before the temp file is created) because deleteExistingTrackFiles matches
		// "$safeKey.*" which includes "$safeKey.tmp"
		synchronized(this) {
			val existingFile = resolveExistingTrackFile(trackId)
			if (existingFile != null && existingFile.exists() && existingFile.isFile) {
				touch(existingFile)
				return toFileUrl(existingFile)
			}
			deleteExistingTrackFiles(cacheDir, safeKey)
		}

		// prevent two threads from downloading the same track simultaneously
		if (!inProgressKeys.add(safeKey)) {
			return ""
		}

		// download without holding the object lock so getCachedTrackFileUrl and other reads
		// aren't blocked during slow network I/O
		return try {
			val connection = openAuthedConnectionFollowingRedirects(url, authToken, "audio/*,*/*")
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
			val tempFile = File(cacheDir, "$safeKey.tmp")
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

			// brief lock to finalize: rename temp to final location and prune cache.
			// no deleteExistingTrackFiles here; stale files were already cleaned above
			synchronized(this) {
				val file = File(cacheDir, "$safeKey.$extension")
				if (!tempFile.renameTo(file)) {
					tempFile.copyTo(file, overwrite = true)
					tempFile.delete()
				}
				touch(file)
				pruneIfNeeded(cacheDir)
				toFileUrl(file)
			}
		} catch (error: Throwable) {
			Log.e(tag, "Failed to cache track trackId=$trackId", error)
			""
		} finally {
			inProgressKeys.remove(safeKey)
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

	private val inProgressKeys = java.util.Collections.synchronizedSet(mutableSetOf<String>())

	fun cacheTrackFromUrl(trackId: String, url: String, authToken: String): String {
		if (trackId.isBlank() || url.isBlank()) {
			return ""
		}

		// only HTTP(S) sources are downloadable here; a local file:// (already-cached/offline) url
		// would throw when cast to HttpURLConnection below, so treat it as nothing to download
		if (!url.startsWith("http://", ignoreCase = true) && !url.startsWith("https://", ignoreCase = true)) {
			return ""
		}

		val cacheDir = resolveCacheDir() ?: return ""
		val safeKey = safeTrackKey(trackId)

		synchronized(this) {
			val existingFile = resolveExistingTrackFile(trackId)
			if (existingFile != null && existingFile.exists() && existingFile.isFile) {
				touch(existingFile)
				return toFileUrl(existingFile)
			}
			deleteExistingTrackFiles(cacheDir, safeKey)
		}

		if (!inProgressKeys.add(safeKey)) {
			return ""
		}

		return try {
			val connection = openAuthedConnectionFollowingRedirects(url, authToken, "audio/*,*/*")
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
			val tempFile = File(cacheDir, "$safeKey.tmp")
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

			// no deleteExistingTrackFiles here; stale files were already cleaned above
			synchronized(this) {
				val file = File(cacheDir, "$safeKey.$extension")
				if (!tempFile.renameTo(file)) {
					tempFile.copyTo(file, overwrite = true)
					tempFile.delete()
				}
				touch(file)
				toFileUrl(file)
			}
		} catch (error: Throwable) {
			Log.e(tag, "Failed to cache downloaded track trackId=$trackId", error)
			""
		} finally {
			inProgressKeys.remove(safeKey)
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
	private val pendingActions = kotlin.collections.ArrayDeque<String>()
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
	// current Jellyfin access token, pushed out-of-band on session change; applied as an auth
	// header when fetching remote artwork so the token never travels in the artwork URL
	@Volatile var authToken: String? = null

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

	// re-publishes the notification/media-session state with the stored metadata when the
	// engine applies a transport action natively (JS may be frozen and unable to push an
	// updated payload)
	@Synchronized
	fun setPlaybackActive(isPlaying: Boolean, positionSeconds: Double) {
		if (activeTrackName.isBlank()) {
			return
		}
		activeIsPlaying = isPlaying
		activePositionMs = (positionSeconds * 1000.0).toLong().coerceAtLeast(0L)
		publishNotificationSnapshot()
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

		if (AtollaPlaybackGuards.shouldPreserveServiceOnClear(AtollaGaplessAudioEngine.isActive())) {
			return
		}

		cancelNotification()
		deactivateMediaSession()
	}

	@Synchronized
	fun consumeAction(): String {
		return pendingActions.removeFirstOrNull() ?: ""
	}

	@Synchronized
	fun onAction(action: String?) {
		val mapped =
			when (action) {
				actionPlay -> "play"
				actionPause -> "pause"
				actionPrevious -> "previous"
				actionNext -> "next"
				actionStop -> "stop"
				else -> return
			}
		// transport actions drive the engine directly so the notification stays responsive
		// while JS is frozen; the JS store reconciles via engine events. queuing them for the
		// JS poll instead would leave the buttons dead and replay stale taps on next open
		if (AtollaPlaybackGuards.shouldHandleMediaActionNatively(mapped)) {
			AtollaGaplessAudioEngine.handleMediaAction(mapped)
			return
		}
		if (mapped == "stop") {
			// silence playback immediately; clearing the queue stays with JS on its next poll
			AtollaGaplessAudioEngine.handleMediaAction("pause")
		}
		if (pendingActions.size < 2) {
			pendingActions.addLast(mapped)
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
		val existing = mediaSession
		if (existing != null) {
			if (!existing.isActive) {
				existing.isActive = true
			}
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
					onAction(actionPause)
				}

				override fun onSeekTo(pos: Long) {
				// atolla handles seek from its own UI
			}
			},
			Handler(Looper.getMainLooper()),
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

		try {
			notificationManager ?: return
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
			builder.setDeleteIntent(actionPendingIntent(context, actionPause, 26))

			currentArtworkBitmap?.let { bitmap ->
				builder.setLargeIcon(bitmap)
			}

			val notification = builder.build()
			// route through the foreground service so Android keeps the process alive when the
			// screen is locked; manager.notify() alone isn't enough, the OS kills the process
			// under background pressure
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
			// stopping the service removes the foreground notification automatically
			AtollaPlaybackService.stopIfRunning()
		} catch (_: Throwable) {
			// ignored
		}
		try {
			// fallback: cancel via NotificationManager in case the service never started
			notificationManager?.cancel(notificationId)
		} catch (_: Throwable) {
			// ignored
		}
	}

	private fun deactivateMediaSession() {
		if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) {
			return
		}

		val session = mediaSession ?: return
		try {
			// set inactive so the system stops showing media controls, but keep the session
			// alive so any in-flight callbacks can still dispatch their action. state/metadata
			// are refreshed by updateMediaState/updateMediaMetadata when the next track calls
			// publishNotificationSnapshot
			session.isActive = false
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

			val connection = openAuthedConnectionFollowingRedirects(artworkUrl, authToken, "image/*,*/*")

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
