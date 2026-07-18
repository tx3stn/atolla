#include <jni.h>
#include "scrobble_tracker.h"

// Called from AtollaScrobbleNative.kt. The scrobble decision is pure and stateless, so this is a
// thin pass-through to shared Zig (scrobble_tracker.zig).
extern "C" JNIEXPORT jboolean JNICALL
Java_com_tx3stn_atolla_AtollaScrobbleNative_nativeShouldCount(
    JNIEnv* /*env*/, jobject /*thiz*/,
    jlong positionMs, jlong durationMs, jfloat thresholdRatio, jboolean isNaturalEnd) {
    const bool counts = atolla_scrobble_should_count(
        positionMs, durationMs, thresholdRatio, isNaturalEnd == JNI_TRUE);
    return counts ? JNI_TRUE : JNI_FALSE;
}
