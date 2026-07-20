package atolla.native.android

object AtollaWaveformCodecSelector {
	data class DecoderCandidate(
		val name: String,
		val isEncoder: Boolean,
		val isSoftwareOnly: Boolean,
		val supportedTypes: List<String>,
	)

	fun selectSoftwareDecoderName(candidates: List<DecoderCandidate>, mime: String): String? {
		for (candidate in candidates) {
			if (candidate.isEncoder) continue
			if (!candidate.isSoftwareOnly) continue
			if (candidate.supportedTypes.none { it.equals(mime, ignoreCase = true) }) continue
			return candidate.name
		}
		return null
	}
}
