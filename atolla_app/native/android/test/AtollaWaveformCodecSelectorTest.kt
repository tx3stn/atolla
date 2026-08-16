package atolla.native.android

import atolla.native.android.AtollaWaveformCodecSelector.DecoderCandidate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AtollaWaveformCodecSelectorTest {

	private fun decoder(
		name: String,
		softwareOnly: Boolean,
		types: List<String> = listOf("audio/mp4a-latm"),
	) = DecoderCandidate(name = name, isEncoder = false, isSoftwareOnly = softwareOnly, supportedTypes = types)

	@Test
	fun `picks the software-only decoder over a hardware one`() {
		val chosen = AtollaWaveformCodecSelector.selectSoftwareDecoderName(
			listOf(
				decoder("OMX.qcom.audio.decoder.aac", softwareOnly = false),
				decoder("c2.android.aac.decoder", softwareOnly = true),
			),
			"audio/mp4a-latm",
		)
		assertEquals("c2.android.aac.decoder", chosen)
	}

	@Test
	fun `ignores encoders even when they are software-only`() {
		val chosen = AtollaWaveformCodecSelector.selectSoftwareDecoderName(
			listOf(
				DecoderCandidate(
					name = "c2.android.aac.encoder",
					isEncoder = true,
					isSoftwareOnly = true,
					supportedTypes = listOf("audio/mp4a-latm"),
				),
			),
			"audio/mp4a-latm",
		)
		assertNull(chosen)
	}

	@Test
	fun `ignores decoders that do not support the mime`() {
		val chosen = AtollaWaveformCodecSelector.selectSoftwareDecoderName(
			listOf(decoder("c2.android.flac.decoder", softwareOnly = true, types = listOf("audio/flac"))),
			"audio/mp4a-latm",
		)
		assertNull(chosen)
	}

	@Test
	fun `returns null when only hardware decoders exist so the caller can fall back`() {
		val chosen = AtollaWaveformCodecSelector.selectSoftwareDecoderName(
			listOf(
				decoder("OMX.qcom.audio.decoder.aac", softwareOnly = false),
				decoder("OMX.MTK.AUDIO.DECODER.AAC", softwareOnly = false),
			),
			"audio/mp4a-latm",
		)
		assertNull(chosen)
	}

	@Test
	fun `matches the mime case-insensitively`() {
		val chosen = AtollaWaveformCodecSelector.selectSoftwareDecoderName(
			listOf(decoder("c2.android.aac.decoder", softwareOnly = true, types = listOf("AUDIO/MP4A-LATM"))),
			"audio/mp4a-latm",
		)
		assertEquals("c2.android.aac.decoder", chosen)
	}
}
