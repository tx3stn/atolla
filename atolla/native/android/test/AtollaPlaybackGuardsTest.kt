package atolla.native.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
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

	// --- shouldTreatTransitionAsAdvance ---

	@Test
	fun `auto transitions always advance`() {
		assertTrue(
			AtollaPlaybackGuards.shouldTreatTransitionAsAdvance(
				reason = AtollaPlaybackGuards.TRANSITION_REASON_AUTO,
				expectingNativeSkip = false,
			),
		)
	}

	@Test
	fun `seek transitions advance only for an engine-initiated skip`() {
		assertTrue(
			AtollaPlaybackGuards.shouldTreatTransitionAsAdvance(
				reason = AtollaPlaybackGuards.TRANSITION_REASON_SEEK,
				expectingNativeSkip = true,
			),
		)
		assertFalse(
			AtollaPlaybackGuards.shouldTreatTransitionAsAdvance(
				reason = AtollaPlaybackGuards.TRANSITION_REASON_SEEK,
				expectingNativeSkip = false,
			),
		)
	}

	@Test
	fun `repeat and playlist-changed transitions never advance`() {
		// MEDIA_ITEM_TRANSITION_REASON_REPEAT = 0, PLAYLIST_CHANGED = 3 in media3.
		assertFalse(AtollaPlaybackGuards.shouldTreatTransitionAsAdvance(reason = 0, expectingNativeSkip = true))
		assertFalse(AtollaPlaybackGuards.shouldTreatTransitionAsAdvance(reason = 3, expectingNativeSkip = true))
	}

	// --- lookaheadAppendCount ---

	@Test
	fun `appends nothing when window already filled`() {
		assertEquals(0, AtollaPlaybackGuards.lookaheadAppendCount(itemCount = 3, currentIndex = 0, targetAhead = 2))
	}

	@Test
	fun `appends to fill the window from a single queued item`() {
		assertEquals(2, AtollaPlaybackGuards.lookaheadAppendCount(itemCount = 1, currentIndex = 0, targetAhead = 2))
	}

	@Test
	fun `appends one when one item is queued ahead`() {
		assertEquals(1, AtollaPlaybackGuards.lookaheadAppendCount(itemCount = 2, currentIndex = 0, targetAhead = 2))
	}

	@Test
	fun `counts ahead relative to the current index`() {
		assertEquals(2, AtollaPlaybackGuards.lookaheadAppendCount(itemCount = 3, currentIndex = 2, targetAhead = 2))
	}

	@Test
	fun `appends nothing for an empty player queue or invalid input`() {
		assertEquals(0, AtollaPlaybackGuards.lookaheadAppendCount(itemCount = 0, currentIndex = 0, targetAhead = 2))
		assertEquals(0, AtollaPlaybackGuards.lookaheadAppendCount(itemCount = 2, currentIndex = -1, targetAhead = 2))
		assertEquals(0, AtollaPlaybackGuards.lookaheadAppendCount(itemCount = 2, currentIndex = 0, targetAhead = 0))
	}

	// --- nextUpcomingIndex ---

	@Test
	fun `first upcoming entry follows the current track`() {
		assertEquals(
			0,
			AtollaPlaybackGuards.nextUpcomingIndex(
				upcomingTrackIds = listOf("b", "c"),
				lastQueuedTrackId = "a",
				currentTrackId = "a",
			),
		)
	}

	@Test
	fun `successor of the last queued upcoming entry is the next one`() {
		assertEquals(
			1,
			AtollaPlaybackGuards.nextUpcomingIndex(
				upcomingTrackIds = listOf("b", "c", "d"),
				lastQueuedTrackId = "b",
				currentTrackId = "a",
			),
		)
	}

	@Test
	fun `no successor when the buffer is exhausted`() {
		assertNull(
			AtollaPlaybackGuards.nextUpcomingIndex(
				upcomingTrackIds = listOf("b", "c"),
				lastQueuedTrackId = "c",
				currentTrackId = "a",
			),
		)
	}

	@Test
	fun `no successor when the last queued item is unknown to the buffer`() {
		assertNull(
			AtollaPlaybackGuards.nextUpcomingIndex(
				upcomingTrackIds = listOf("b", "c"),
				lastQueuedTrackId = "x",
				currentTrackId = "a",
			),
		)
	}

	@Test
	fun `no successor for an empty buffer or blank last item`() {
		assertNull(
			AtollaPlaybackGuards.nextUpcomingIndex(
				upcomingTrackIds = emptyList(),
				lastQueuedTrackId = "a",
				currentTrackId = "a",
			),
		)
		assertNull(
			AtollaPlaybackGuards.nextUpcomingIndex(
				upcomingTrackIds = listOf("b"),
				lastQueuedTrackId = "",
				currentTrackId = "a",
			),
		)
	}

	@Test
	fun `track loop buffer of repeated ids keeps yielding the repeat`() {
		assertEquals(
			1,
			AtollaPlaybackGuards.nextUpcomingIndex(
				upcomingTrackIds = listOf("a", "a", "a"),
				lastQueuedTrackId = "a",
				currentTrackId = "a",
			),
		)
	}
}
