package atolla.native.android

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
			AtollaPlaybackGuards.shouldRebuildQueueForState(isEnded = false, currentItemMatches = false),
		)
	}

	@Test
	fun `rebuilds queue when ended even if current item matches`() {
		assertTrue(
			AtollaPlaybackGuards.shouldRebuildQueueForState(isEnded = true, currentItemMatches = true),
		)
	}

	@Test
	fun `keeps fast-path when playing and current item matches`() {
		assertFalse(
			AtollaPlaybackGuards.shouldRebuildQueueForState(isEnded = false, currentItemMatches = true),
		)
	}
}
