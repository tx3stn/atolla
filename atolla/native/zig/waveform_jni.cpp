#include <jni.h>
#include <cstdint>
#include <vector>
#include "waveform_generator.h"

// Called from AtollaWaveformWorker.kt with the raw per-column RMS amplitudes
// accumulated during streaming decode. Zig smooths/normalises the amps and
// returns the waveform outline as a start point followed by cubic Bézier
// segments (see waveform_generator.h); the Kotlin side replays them into a Path.
// Returns a float[] of the control-point stream, or null on failure.
extern "C" JNIEXPORT jfloatArray JNICALL
Java_com_tx3stn_atolla_AtollaWaveformWorker_nativeBuildWaveformPath(
    JNIEnv* env, jobject /*thiz*/,
    jfloatArray amps, jint width, jint height) {

    const jsize num_amps = env->GetArrayLength(amps);
    if (num_amps < 2) return nullptr;

    jfloat* raw = env->GetFloatArrayElements(amps, nullptr);
    if (!raw) return nullptr;

    const uint32_t capacity = 2 + (2 * static_cast<uint32_t>(num_amps) - 1) * 6;
    std::vector<float> out(capacity);
    uint32_t count = 0;
    const bool ok = atolla_waveform_build_path(
        raw,
        static_cast<uint32_t>(num_amps),
        static_cast<float>(width),
        static_cast<float>(height),
        out.data(),
        capacity,
        &count);
    env->ReleaseFloatArrayElements(amps, raw, JNI_ABORT);

    if (!ok || count == 0) return nullptr;

    jfloatArray result = env->NewFloatArray(static_cast<jsize>(count));
    if (result) {
        env->SetFloatArrayRegion(result, 0, static_cast<jsize>(count), out.data());
    }
    return result;
}
