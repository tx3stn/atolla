#include <jni.h>
#include <cstdlib>
#include "waveform_generator.h"

// Called from AtollaWaveformWorker.kt after MediaExtractor/MediaCodec decodes
// the audio file to interleaved float32 PCM.
// Returns a byte array containing the PNG, or null on failure.
// The caller writes the PNG to disk and informs WaveformService of the result.
extern "C" JNIEXPORT jbyteArray JNICALL
Java_com_tx3stn_atolla_AtollaWaveformWorker_nativeGenerateWaveform(
    JNIEnv* env, jobject /*thiz*/,
    jfloatArray samples, jint channel_count, jint width, jint height) {

    const jsize sample_count = env->GetArrayLength(samples);
    jfloat* raw = env->GetFloatArrayElements(samples, nullptr);
    if (!raw) return nullptr;

    uint32_t out_len = 0;
    uint8_t* png = atolla_generate_waveform(
        raw,
        static_cast<uint32_t>(sample_count),
        static_cast<uint32_t>(channel_count),
        static_cast<uint32_t>(width),
        static_cast<uint32_t>(height),
        &out_len);
    env->ReleaseFloatArrayElements(samples, raw, JNI_ABORT);

    if (!png || out_len == 0) return nullptr;

    jbyteArray result = env->NewByteArray(static_cast<jsize>(out_len));
    if (result) {
        env->SetByteArrayRegion(result, 0, static_cast<jsize>(out_len),
                                reinterpret_cast<const jbyte*>(png));
    }
    std::free(png);
    return result;
}

// Called from AtollaWaveformWorker.kt with pre-computed per-column amplitudes.
// Amps are peak values accumulated during streaming decode, covering the full
// track regardless of length. Normalisation happens inside Zig.
extern "C" JNIEXPORT jbyteArray JNICALL
Java_com_tx3stn_atolla_AtollaWaveformWorker_nativeRenderWaveformFromAmps(
    JNIEnv* env, jobject /*thiz*/,
    jfloatArray amps, jint width, jint height) {

    jfloat* raw = env->GetFloatArrayElements(amps, nullptr);
    if (!raw) return nullptr;

    uint32_t out_len = 0;
    uint8_t* png = atolla_render_waveform_from_amps(
        raw,
        static_cast<uint32_t>(width),
        static_cast<uint32_t>(height),
        &out_len);
    env->ReleaseFloatArrayElements(amps, raw, JNI_ABORT);

    if (!png || out_len == 0) return nullptr;

    jbyteArray result = env->NewByteArray(static_cast<jsize>(out_len));
    if (result) {
        env->SetByteArrayRegion(result, 0, static_cast<jsize>(out_len),
                                reinterpret_cast<const jbyte*>(png));
    }
    std::free(png);
    return result;
}
