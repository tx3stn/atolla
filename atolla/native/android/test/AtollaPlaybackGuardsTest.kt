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
}
