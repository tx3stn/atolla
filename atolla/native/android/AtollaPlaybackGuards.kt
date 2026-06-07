package atolla.native.android

object AtollaPlaybackGuards {
	// Mirrors Player.PLAY_WHEN_READY_CHANGE_REASON_AUDIO_BECOMING_NOISY (media3 = 3).
	// Exposed so tests can reference the constant without a media3 dependency.
	const val REASON_AUDIO_BECOMING_NOISY = 3

	// Mirrors Player.PLAY_WHEN_READY_CHANGE_REASON_AUDIO_FOCUS_LOSS (media3 = 2).
	const val REASON_AUDIO_FOCUS_LOSS = 2

	// Returns true only for headphone unplug / audio output steal — not for audio focus ducking
	// (maps navigation). ExoPlayer handles ducking transparently and auto-resumes; propagating
	// a pause-requested for focus loss would convert that into a user-intent pause in the JS
	// layer and block the resume.
	fun shouldEmitPauseForReason(reason: Int): Boolean =
		reason == REASON_AUDIO_BECOMING_NOISY

	// Returns true when the foreground service should be left alive despite a clear-notification
	// call. On every app start the JS store restores asynchronously; during that window
	// clearAtollaTrackPlaybackNotification() fires with track=null while ExoPlayer may still be
	// playing in the background. Tearing down the service would kill background playback.
	fun shouldPreserveServiceOnClear(isAudioActive: Boolean): Boolean = isAudioActive

	// Mirrors Player.STATE_ENDED (media3 = 4). Exposed so tests can reason about the ended
	// state without a media3 dependency.
	const val STATE_ENDED = 4

	// Mirrors Player.STATE_IDLE (media3 = 1) — the state ExoPlayer drops into after a
	// playback error (or stop()), where playWhenReady = true is a no-op without prepare().
	const val STATE_IDLE = 1

	// A resume/play request (playWhenReady = true) is a no-op once ExoPlayer has reached
	// STATE_ENDED — the player must be seeked back into the item to leave the ended state.
	// This is the offline track-transition stall: the JS store still believes playback is
	// active, but the engine sat through end-of-queue. Callers should seek to the default
	// position before setting playWhenReady when this returns true.
	fun shouldSeekToRecoverEndedState(playbackState: Int): Boolean = playbackState == STATE_ENDED

	// After a player error ExoPlayer parks in STATE_IDLE; playWhenReady alone never restarts
	// it. Callers must prepare() again before resuming when this returns true.
	fun shouldPrepareBeforeResume(playbackState: Int): Boolean = playbackState == STATE_IDLE

	// configure()/syncQueue() normally take a fast-path that only updates the gapless "next"
	// item when the current media item already matches the requested source. That fast-path
	// must NOT be taken when the player is ended (the matching item has played out) or idle
	// (an error un-prepared the player) — both need replaceQueue so prepare() runs and the
	// item actually plays. Rebuild whenever the player is ended, idle, or the current item
	// does not match the requested source.
	fun shouldRebuildQueueForState(isEnded: Boolean, isIdle: Boolean, currentItemMatches: Boolean): Boolean =
		isEnded || isIdle || !currentItemMatches

	// Media-session/notification transport actions are applied to the player directly at tap
	// time: the JS poll that used to apply them freezes in the background, leaving the
	// notification buttons dead and replaying stale taps when the app next opens. Only "stop"
	// stays on the JS path — clearing the queue is store business.
	fun shouldHandleMediaActionNatively(action: String): Boolean =
		action == "play" || action == "pause" || action == "next" || action == "previous"

	// Mirrors Player.MEDIA_ITEM_TRANSITION_REASON_AUTO (media3 = 1) and
	// MEDIA_ITEM_TRANSITION_REASON_SEEK (media3 = 2).
	const val TRANSITION_REASON_AUTO = 1
	const val TRANSITION_REASON_SEEK = 2

	// A media item transition advances the engine's track state when ExoPlayer auto-advanced
	// at a track boundary, or when the engine itself initiated a skip (seekToNextMediaItem
	// reports reason SEEK). Other seeks and playlist rebuilds must not advance.
	fun shouldTreatTransitionAsAdvance(reason: Int, expectingNativeSkip: Boolean): Boolean =
		reason == TRANSITION_REASON_AUTO || (reason == TRANSITION_REASON_SEEK && expectingNativeSkip)

	// How many media items must be appended so the player holds targetAhead items beyond the
	// current one. Background playback can only auto-advance through items that are already
	// queued — JS is frozen and cannot top the queue up at each transition.
	fun lookaheadAppendCount(itemCount: Int, currentIndex: Int, targetAhead: Int): Int {
		if (itemCount <= 0 || currentIndex < 0 || targetAhead <= 0) {
			return 0
		}
		val ahead = itemCount - 1 - currentIndex
		return (targetAhead - ahead).coerceAtLeast(0)
	}

	// Index in the ordered upcoming buffer of the entry to append after the last queued item,
	// or null when the buffer has no known successor. The buffer starts at the track after
	// currentTrackId, so when the last queued item IS the current track the successor is the
	// first buffer entry. Matching uses the first occurrence of an id: for loop buffers with
	// repeated ids the successor is identical at every occurrence, so this stays correct.
	fun nextUpcomingIndex(
		upcomingTrackIds: List<String>,
		lastQueuedTrackId: String,
		currentTrackId: String,
	): Int? {
		if (upcomingTrackIds.isEmpty() || lastQueuedTrackId.isBlank()) {
			return null
		}

		val lastIndex = upcomingTrackIds.indexOf(lastQueuedTrackId)
		if (lastIndex >= 0) {
			return if (lastIndex + 1 < upcomingTrackIds.size) lastIndex + 1 else null
		}

		return if (lastQueuedTrackId == currentTrackId) 0 else null
	}
}
