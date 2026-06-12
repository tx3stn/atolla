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

	// On a wake-race JS can push a stale earlier track; rebuilding from 0 would jerk a playing
	// engine backward. Suppress when it is playing and its current item is at/ahead of the
	// requested one (window indices; -1 = unknown, disables suppression). Mismatch rebuilds only —
	// never when ended/idle, which need a rebuild to re-prepare. allowBackwardRebuild is the
	// caller's intent — a deliberate previous/back-to passes true and is honored.
	fun shouldSuppressBackwardRebuild(
		isPlaying: Boolean,
		requestedAnchor: Int,
		currentAnchor: Int,
		allowBackwardRebuild: Boolean,
	): Boolean =
		!allowBackwardRebuild &&
			isPlaying &&
			requestedAnchor >= 0 &&
			currentAnchor >= 0 &&
			currentAnchor >= requestedAnchor

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

	enum class TransitionKind { ADVANCE, STEP_BACK, IGNORE }

	// Classifies a media item transition for the engine's track state: ExoPlayer auto-advances
	// at track boundaries (ADVANCE), engine-initiated next-skips report reason SEEK (ADVANCE),
	// engine-initiated previous-steps report reason SEEK (STEP_BACK). Other seeks and playlist
	// rebuilds must not move the track state.
	fun classifyTransition(
		reason: Int,
		expectingNativeSkip: Boolean,
		expectingNativeStepBack: Boolean,
	): TransitionKind =
		when {
			reason == TRANSITION_REASON_AUTO -> TransitionKind.ADVANCE
			reason != TRANSITION_REASON_SEEK -> TransitionKind.IGNORE
			expectingNativeStepBack -> TransitionKind.STEP_BACK
			expectingNativeSkip -> TransitionKind.ADVANCE
			else -> TransitionKind.IGNORE
		}

	// Standard previous-button behaviour: restart the current track when more than ~3s in (or
	// when there is nothing earlier to step back to), otherwise go to the previous item.
	const val PREVIOUS_RESTART_THRESHOLD_MS = 3_000L

	fun shouldRestartForPreviousAction(positionMs: Long, hasPreviousItem: Boolean): Boolean =
		positionMs > PREVIOUS_RESTART_THRESHOLD_MS || !hasPreviousItem

	// Locates the current track inside the ordered queue window ([history..., current,
	// upcoming...]), or -1 when it isn't present. The hint is the engine's running cursor
	// (payload currentIndex, shifted on each transition); when it has drifted — or the window
	// contains the same id more than once (loop wraps) — the occurrence nearest the hint wins.
	fun resolveWindowAnchor(windowIds: List<String>, hintIndex: Int, currentTrackId: String): Int {
		if (windowIds.isEmpty() || currentTrackId.isBlank()) {
			return -1
		}

		val clampedHint = hintIndex.coerceIn(0, windowIds.size - 1)
		if (windowIds[clampedHint] == currentTrackId) {
			return clampedHint
		}

		var best = -1
		var bestDistance = Int.MAX_VALUE
		for (index in windowIds.indices) {
			if (windowIds[index] != currentTrackId) {
				continue
			}
			val distance = kotlin.math.abs(index - clampedHint)
			if (distance < bestDistance) {
				best = index
				bestDistance = distance
			}
		}
		return best
	}
}
