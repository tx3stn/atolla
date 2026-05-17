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
}
