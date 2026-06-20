package atolla.native.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AtollaPlaybackGuardsTest {

	// --- shouldEmitPauseForReason ---

	@Test
	fun `audio becoming noisy emits pause-requested`() {
		assertTrue(AtollaPlaybackGuards.shouldEmitPauseForReason(AtollaPlaybackGuards.REASON_AUDIO_BECOMING_NOISY))
	}

	@Test
	fun `audio focus loss does not emit pause-requested`() {
		assertFalse(AtollaPlaybackGuards.shouldEmitPauseForReason(AtollaPlaybackGuards.REASON_AUDIO_FOCUS_LOSS))
	}

	// --- shouldPreserveServiceOnClear ---

	@Test
	fun `clear notification preserves foreground service while audio is active`() {
		assertTrue(AtollaPlaybackGuards.shouldPreserveServiceOnClear(isAudioActive = true))
	}

	@Test
	fun `clear notification tears down foreground service when audio is inactive`() {
		assertFalse(AtollaPlaybackGuards.shouldPreserveServiceOnClear(isAudioActive = false))
	}

	// --- shouldSeekToRecoverEndedState ---

	@Test
	fun `ended state requires a seek before resume takes effect`() {
		assertTrue(AtollaPlaybackGuards.shouldSeekToRecoverEndedState(AtollaPlaybackGuards.STATE_ENDED))
	}

	@Test
	fun `non-ended states resume without a recovery seek`() {
		// STATE_IDLE = 1, STATE_BUFFERING = 2, STATE_READY = 3 in media3.
		assertFalse(AtollaPlaybackGuards.shouldSeekToRecoverEndedState(1))
		assertFalse(AtollaPlaybackGuards.shouldSeekToRecoverEndedState(2))
		assertFalse(AtollaPlaybackGuards.shouldSeekToRecoverEndedState(3))
	}

	// --- shouldRebuildQueueForState ---

	@Test
	fun `rebuilds queue when current item does not match`() {
		assertTrue(
			AtollaPlaybackGuards.shouldRebuildQueueForState(
				isEnded = false,
				isIdle = false,
				currentItemMatches = false,
			),
		)
	}

	@Test
	fun `rebuilds queue when ended even if current item matches`() {
		assertTrue(
			AtollaPlaybackGuards.shouldRebuildQueueForState(
				isEnded = true,
				isIdle = false,
				currentItemMatches = true,
			),
		)
	}

	@Test
	fun `rebuilds queue when idle even if current item matches`() {
		assertTrue(
			AtollaPlaybackGuards.shouldRebuildQueueForState(
				isEnded = false,
				isIdle = true,
				currentItemMatches = true,
			),
		)
	}

	@Test
	fun `keeps fast-path when playing and current item matches`() {
		assertFalse(
			AtollaPlaybackGuards.shouldRebuildQueueForState(
				isEnded = false,
				isIdle = false,
				currentItemMatches = true,
			),
		)
	}

	// --- shouldDeferLookaheadForSource ---

	@Test
	fun `defers lookahead for an https stream source`() {
		assertTrue(AtollaPlaybackGuards.shouldDeferLookaheadForSource("https://server/Audio/123/stream.mp3"))
	}

	@Test
	fun `defers lookahead for an http stream source`() {
		assertTrue(AtollaPlaybackGuards.shouldDeferLookaheadForSource("http://server/Audio/123/stream.mp3"))
	}

	@Test
	fun `keeps lookahead for a file source`() {
		assertFalse(AtollaPlaybackGuards.shouldDeferLookaheadForSource("file:///data/tracks/123.mp3"))
	}

	@Test
	fun `keeps lookahead for a bare local path source`() {
		assertFalse(AtollaPlaybackGuards.shouldDeferLookaheadForSource("/data/tracks/123.mp3"))
	}

	@Test
	fun `keeps lookahead for a blank source`() {
		assertFalse(AtollaPlaybackGuards.shouldDeferLookaheadForSource(""))
	}

	// --- shouldPrepareBeforeResume ---

	@Test
	fun `idle player must be re-prepared before resume`() {
		assertTrue(AtollaPlaybackGuards.shouldPrepareBeforeResume(AtollaPlaybackGuards.STATE_IDLE))
	}

	@Test
	fun `non-idle states resume without re-preparing`() {
		// STATE_BUFFERING = 2, STATE_READY = 3, STATE_ENDED = 4 in media3.
		assertFalse(AtollaPlaybackGuards.shouldPrepareBeforeResume(2))
		assertFalse(AtollaPlaybackGuards.shouldPrepareBeforeResume(3))
		assertFalse(AtollaPlaybackGuards.shouldPrepareBeforeResume(AtollaPlaybackGuards.STATE_ENDED))
	}

	// --- shouldHandleMediaActionNatively ---

	@Test
	fun `transport actions are handled natively at tap time`() {
		assertTrue(AtollaPlaybackGuards.shouldHandleMediaActionNatively("play"))
		assertTrue(AtollaPlaybackGuards.shouldHandleMediaActionNatively("pause"))
		assertTrue(AtollaPlaybackGuards.shouldHandleMediaActionNatively("next"))
		assertTrue(AtollaPlaybackGuards.shouldHandleMediaActionNatively("previous"))
	}

	@Test
	fun `stop and unknown actions stay on the JS path`() {
		assertFalse(AtollaPlaybackGuards.shouldHandleMediaActionNatively("stop"))
		assertFalse(AtollaPlaybackGuards.shouldHandleMediaActionNatively(""))
		assertFalse(AtollaPlaybackGuards.shouldHandleMediaActionNatively("toggle"))
	}

	// --- classifyTransition ---

	@Test
	fun `auto transitions always advance`() {
		assertEquals(
			AtollaPlaybackGuards.TransitionKind.ADVANCE,
			AtollaPlaybackGuards.classifyTransition(
				reason = AtollaPlaybackGuards.TRANSITION_REASON_AUTO,
				expectingNativeSkip = false,
				expectingNativeStepBack = false,
			),
		)
	}

	@Test
	fun `seek transitions advance for an engine-initiated skip`() {
		assertEquals(
			AtollaPlaybackGuards.TransitionKind.ADVANCE,
			AtollaPlaybackGuards.classifyTransition(
				reason = AtollaPlaybackGuards.TRANSITION_REASON_SEEK,
				expectingNativeSkip = true,
				expectingNativeStepBack = false,
			),
		)
	}

	@Test
	fun `seek transitions step back for an engine-initiated previous`() {
		assertEquals(
			AtollaPlaybackGuards.TransitionKind.STEP_BACK,
			AtollaPlaybackGuards.classifyTransition(
				reason = AtollaPlaybackGuards.TRANSITION_REASON_SEEK,
				expectingNativeSkip = false,
				expectingNativeStepBack = true,
			),
		)
	}

	@Test
	fun `unexpected seek transitions are ignored`() {
		assertEquals(
			AtollaPlaybackGuards.TransitionKind.IGNORE,
			AtollaPlaybackGuards.classifyTransition(
				reason = AtollaPlaybackGuards.TRANSITION_REASON_SEEK,
				expectingNativeSkip = false,
				expectingNativeStepBack = false,
			),
		)
	}

	@Test
	fun `repeat and playlist-changed transitions never advance`() {
		// MEDIA_ITEM_TRANSITION_REASON_REPEAT = 0, PLAYLIST_CHANGED = 3 in media3.
		assertEquals(
			AtollaPlaybackGuards.TransitionKind.IGNORE,
			AtollaPlaybackGuards.classifyTransition(0, expectingNativeSkip = true, expectingNativeStepBack = true),
		)
		assertEquals(
			AtollaPlaybackGuards.TransitionKind.IGNORE,
			AtollaPlaybackGuards.classifyTransition(3, expectingNativeSkip = true, expectingNativeStepBack = true),
		)
	}

	// --- shouldClearTransitionExpectation ---

	@Test
	fun `clears the skip and step-back expectation on a seek transition`() {
		assertTrue(AtollaPlaybackGuards.shouldClearTransitionExpectation(AtollaPlaybackGuards.TRANSITION_REASON_SEEK))
	}

	@Test
	fun `clears the expectation on an auto transition that races the seek`() {
		assertTrue(AtollaPlaybackGuards.shouldClearTransitionExpectation(AtollaPlaybackGuards.TRANSITION_REASON_AUTO))
	}

	@Test
	fun `keeps the expectation for repeat and playlist-changed transitions`() {
		// MEDIA_ITEM_TRANSITION_REASON_REPEAT = 0, PLAYLIST_CHANGED = 3 in media3.
		assertFalse(AtollaPlaybackGuards.shouldClearTransitionExpectation(0))
		assertFalse(AtollaPlaybackGuards.shouldClearTransitionExpectation(3))
	}

	// --- shouldRestartForPreviousAction ---

	@Test
	fun `previous restarts the current track when well into playback`() {
		assertTrue(AtollaPlaybackGuards.shouldRestartForPreviousAction(positionMs = 5_000, hasPreviousItem = true))
	}

	@Test
	fun `previous steps back near the start of a track`() {
		assertFalse(AtollaPlaybackGuards.shouldRestartForPreviousAction(positionMs = 2_000, hasPreviousItem = true))
	}

	@Test
	fun `previous restarts when there is no earlier item to step back to`() {
		assertTrue(AtollaPlaybackGuards.shouldRestartForPreviousAction(positionMs = 1_000, hasPreviousItem = false))
	}

	@Test
	fun `previous threshold boundary is three seconds`() {
		assertFalse(AtollaPlaybackGuards.shouldRestartForPreviousAction(positionMs = 3_000, hasPreviousItem = true))
		assertTrue(AtollaPlaybackGuards.shouldRestartForPreviousAction(positionMs = 3_001, hasPreviousItem = true))
	}

	// --- resolveWindowAnchor ---

	@Test
	fun `anchor matches the hinted index when the id lines up`() {
		assertEquals(
			2,
			AtollaPlaybackGuards.resolveWindowAnchor(
				windowIds = listOf("a", "b", "c", "d"),
				hintIndex = 2,
				currentTrackId = "c",
			),
		)
	}

	@Test
	fun `anchor is corrected to the nearest occurrence when the hint is stale`() {
		assertEquals(
			3,
			AtollaPlaybackGuards.resolveWindowAnchor(
				windowIds = listOf("a", "b", "c", "d"),
				hintIndex = 2,
				currentTrackId = "d",
			),
		)
	}

	@Test
	fun `duplicate ids resolve to the occurrence nearest the hint`() {
		// Queue-loop windows repeat ids; the hint disambiguates which occurrence is current.
		assertEquals(
			3,
			AtollaPlaybackGuards.resolveWindowAnchor(
				windowIds = listOf("a", "b", "a", "a", "b"),
				hintIndex = 3,
				currentTrackId = "a",
			),
		)
		assertEquals(
			0,
			AtollaPlaybackGuards.resolveWindowAnchor(
				windowIds = listOf("a", "b", "a", "a", "b"),
				hintIndex = 0,
				currentTrackId = "a",
			),
		)
	}

	@Test
	fun `no anchor for an unknown id or empty window`() {
		assertEquals(
			-1,
			AtollaPlaybackGuards.resolveWindowAnchor(
				windowIds = listOf("a", "b"),
				hintIndex = 0,
				currentTrackId = "x",
			),
		)
		assertEquals(
			-1,
			AtollaPlaybackGuards.resolveWindowAnchor(
				windowIds = emptyList(),
				hintIndex = 0,
				currentTrackId = "a",
			),
		)
	}

	@Test
	fun `out of range hints are tolerated`() {
		assertEquals(
			1,
			AtollaPlaybackGuards.resolveWindowAnchor(
				windowIds = listOf("a", "b"),
				hintIndex = 99,
				currentTrackId = "b",
			),
		)
		assertEquals(
			0,
			AtollaPlaybackGuards.resolveWindowAnchor(
				windowIds = listOf("a", "b"),
				hintIndex = -5,
				currentTrackId = "a",
			),
		)
	}

	// --- shouldSuppressBackwardRebuild ---

	@Test
	fun `suppresses a stale wake-race rebuild that would pull a playing engine back to an earlier track`() {
		assertTrue(
			AtollaPlaybackGuards.shouldSuppressBackwardRebuild(
				isPlaying = true,
				requestedAnchor = 1,
				currentAnchor = 3,
				allowBackwardRebuild = false,
			),
		)
	}

	@Test
	fun `suppresses a stale wake-race rebuild when the engine is on the same window slot`() {
		assertTrue(
			AtollaPlaybackGuards.shouldSuppressBackwardRebuild(
				isPlaying = true,
				requestedAnchor = 2,
				currentAnchor = 2,
				allowBackwardRebuild = false,
			),
		)
	}

	@Test
	fun `allows a rebuild that moves a playing engine forward`() {
		assertFalse(
			AtollaPlaybackGuards.shouldSuppressBackwardRebuild(
				isPlaying = true,
				requestedAnchor = 3,
				currentAnchor = 1,
				allowBackwardRebuild = false,
			),
		)
	}

	@Test
	fun `never suppresses when the engine is not playing`() {
		assertFalse(
			AtollaPlaybackGuards.shouldSuppressBackwardRebuild(
				isPlaying = false,
				requestedAnchor = 1,
				currentAnchor = 3,
				allowBackwardRebuild = false,
			),
		)
	}

	@Test
	fun `never suppresses when an anchor is unknown`() {
		assertFalse(
			AtollaPlaybackGuards.shouldSuppressBackwardRebuild(
				isPlaying = true,
				requestedAnchor = -1,
				currentAnchor = 3,
				allowBackwardRebuild = false,
			),
		)
		assertFalse(
			AtollaPlaybackGuards.shouldSuppressBackwardRebuild(
				isPlaying = true,
				requestedAnchor = 1,
				currentAnchor = -1,
				allowBackwardRebuild = false,
			),
		)
	}

	@Test
	fun `honors a deliberate in-app backward navigation while playing`() {
		// previous button / back-to tap: the same shape the wake-race guard would otherwise
		// suppress (playing, current ahead of requested), but the caller signalled intent.
		assertFalse(
			AtollaPlaybackGuards.shouldSuppressBackwardRebuild(
				isPlaying = true,
				requestedAnchor = 1,
				currentAnchor = 3,
				allowBackwardRebuild = true,
			),
		)
	}

	@Test
	fun `honors a deliberate navigation to the same window slot while playing`() {
		assertFalse(
			AtollaPlaybackGuards.shouldSuppressBackwardRebuild(
				isPlaying = true,
				requestedAnchor = 2,
				currentAnchor = 2,
				allowBackwardRebuild = true,
			),
		)
	}
}
