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

	// A resume/play request (playWhenReady = true) is a no-op once ExoPlayer has reached
	// STATE_ENDED — the player must be seeked back into the item to leave the ended state.
	// This is the offline track-transition stall: the JS store still believes playback is
	// active, but the engine sat through end-of-queue. Callers should seek to the default
	// position before setting playWhenReady when this returns true.
	fun shouldSeekToRecoverEndedState(playbackState: Int): Boolean = playbackState == STATE_ENDED

	// configure()/syncQueue() normally take a fast-path that only updates the gapless "next"
	// item when the current media item already matches the requested source. That fast-path
	// must NOT be taken when the player is ended: the matching item has played out and needs
	// to be re-prepared (replaceQueue) so it actually plays. Rebuild whenever the player is
	// ended OR the current item does not match the requested source.
	fun shouldRebuildQueueForState(isEnded: Boolean, currentItemMatches: Boolean): Boolean =
		isEnded || !currentItemMatches
}
