#include <jni.h>
#include "waveform_store.h"

extern "C" JNIEXPORT void JNICALL
Java_com_tx3stn_atolla_AtollaWaveformStore_nativeClear(JNIEnv* env, jobject /*thiz*/, jstring dir) {
    const char* dirChars = env->GetStringUTFChars(dir, nullptr);

    atolla_waveform_store_clear(
        reinterpret_cast<const uint8_t*>(dirChars),
        static_cast<size_t>(env->GetStringUTFLength(dir)));

    env->ReleaseStringUTFChars(dir, dirChars);
}

extern "C" JNIEXPORT jint JNICALL
Java_com_tx3stn_atolla_AtollaWaveformStore_nativeCount(JNIEnv* env, jobject /*thiz*/, jstring dir) {
    const char* dirChars = env->GetStringUTFChars(dir, nullptr);

    const uint32_t count = atolla_waveform_store_count(
        reinterpret_cast<const uint8_t*>(dirChars),
        static_cast<size_t>(env->GetStringUTFLength(dir)));

    env->ReleaseStringUTFChars(dir, dirChars);

    return static_cast<jint>(count);
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_tx3stn_atolla_AtollaWaveformStore_nativeHas(
    JNIEnv* env, jobject /*thiz*/, jstring dir, jstring trackId) {
    const char* dirChars = env->GetStringUTFChars(dir, nullptr);
    const char* trackIdChars = env->GetStringUTFChars(trackId, nullptr);

    const bool has = atolla_waveform_store_has(
        reinterpret_cast<const uint8_t*>(dirChars),
        static_cast<size_t>(env->GetStringUTFLength(dir)),
        reinterpret_cast<const uint8_t*>(trackIdChars),
        static_cast<size_t>(env->GetStringUTFLength(trackId)));

    env->ReleaseStringUTFChars(trackId, trackIdChars);
    env->ReleaseStringUTFChars(dir, dirChars);

    return has ? JNI_TRUE : JNI_FALSE;
}

// TODO(waveform-migration): remove once it's been long enough that all uses of old waveform cache have been replaced
extern "C" JNIEXPORT jint JNICALL
Java_com_tx3stn_atolla_AtollaWaveformStore_nativeMigrate(
    JNIEnv* env, jobject /*thiz*/, jstring dir, jstring recordsJson) {
    const char* dirChars = env->GetStringUTFChars(dir, nullptr);
    const char* recordsJsonChars = env->GetStringUTFChars(recordsJson, nullptr);

    const uint32_t migrated = atolla_waveform_store_migrate(
        reinterpret_cast<const uint8_t*>(dirChars),
        static_cast<size_t>(env->GetStringUTFLength(dir)),
        reinterpret_cast<const uint8_t*>(recordsJsonChars),
        static_cast<size_t>(env->GetStringUTFLength(recordsJson)));

    env->ReleaseStringUTFChars(recordsJson, recordsJsonChars);
    env->ReleaseStringUTFChars(dir, dirChars);

    return static_cast<jint>(migrated);
}

extern "C" JNIEXPORT jbyteArray JNICALL
Java_com_tx3stn_atolla_AtollaWaveformStore_nativeRead(
    JNIEnv* env, jobject /*thiz*/, jstring dir, jstring trackId) {
    const char* dirChars = env->GetStringUTFChars(dir, nullptr);
    const char* trackIdChars = env->GetStringUTFChars(trackId, nullptr);

    uint8_t amps[ATOLLA_WAVEFORM_STORE_MAX_BYTES];
    size_t ampsLen = 0;
    const bool read = atolla_waveform_store_read(
        reinterpret_cast<const uint8_t*>(dirChars),
        static_cast<size_t>(env->GetStringUTFLength(dir)),
        reinterpret_cast<const uint8_t*>(trackIdChars),
        static_cast<size_t>(env->GetStringUTFLength(trackId)),
        amps,
        &ampsLen);

    env->ReleaseStringUTFChars(trackId, trackIdChars);
    env->ReleaseStringUTFChars(dir, dirChars);

    if (!read) return nullptr;

    jbyteArray result = env->NewByteArray(static_cast<jsize>(ampsLen));
    if (result) {
        env->SetByteArrayRegion(result, 0, static_cast<jsize>(ampsLen), reinterpret_cast<const jbyte*>(amps));
    }
    return result;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_tx3stn_atolla_AtollaWaveformStore_nativeWrite(
    JNIEnv* env, jobject /*thiz*/, jstring dir, jstring trackId, jbyteArray amps) {
    const char* dirChars = env->GetStringUTFChars(dir, nullptr);
    const char* trackIdChars = env->GetStringUTFChars(trackId, nullptr);
    jbyte* ampsBytes = env->GetByteArrayElements(amps, nullptr);

    const bool written = ampsBytes && atolla_waveform_store_write(
        reinterpret_cast<const uint8_t*>(dirChars),
        static_cast<size_t>(env->GetStringUTFLength(dir)),
        reinterpret_cast<const uint8_t*>(trackIdChars),
        static_cast<size_t>(env->GetStringUTFLength(trackId)),
        reinterpret_cast<const uint8_t*>(ampsBytes),
        static_cast<size_t>(env->GetArrayLength(amps)));

    if (ampsBytes) env->ReleaseByteArrayElements(amps, ampsBytes, JNI_ABORT);
    env->ReleaseStringUTFChars(trackId, trackIdChars);
    env->ReleaseStringUTFChars(dir, dirChars);

    return written ? JNI_TRUE : JNI_FALSE;
}
