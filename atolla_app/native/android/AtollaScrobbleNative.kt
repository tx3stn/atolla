package com.tx3stn.atolla

// Shared scrobble "played?" decision, bridged to Zig (scrobble_tracker.zig) via JNI
// (scrobble_jni.cpp). Stateless: the audio engine calls it at the discrete points a track ends or
// is left. Declared as a class instance method so the generated JNI symbol matches the other native
// bridges: Java_com_tx3stn_atolla_AtollaScrobbleNative_nativeShouldCount
class AtollaScrobbleNative {
	private external fun nativeShouldCount(
		positionMs: Long,
		durationMs: Long,
		thresholdRatio: Float,
		isNaturalEnd: Boolean,
	): Boolean

	companion object {
		// reused instance solely to reach the JNI bridge from the (static) engine call sites
		private val bridge = AtollaScrobbleNative()

		// true when the track should be scrobbled: a natural end always counts, otherwise the track
		// counts only when the leave position reached thresholdRatio of the duration
		fun shouldCount(
			positionMs: Long,
			durationMs: Long,
			thresholdRatio: Float,
			isNaturalEnd: Boolean,
		): Boolean = bridge.nativeShouldCount(positionMs, durationMs, thresholdRatio, isNaturalEnd)
	}
}
