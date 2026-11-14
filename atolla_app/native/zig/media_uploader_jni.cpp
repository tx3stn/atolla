#include <jni.h>
#include "media_uploader.h"

extern "C" JNIEXPORT void JNICALL
Java_com_tx3stn_atolla_AtollaMediaUploader_nativeInit(JNIEnv* /*env*/, jobject /*thiz*/) {
    atolla_media_uploader_init();
}

extern "C" JNIEXPORT void JNICALL
Java_com_tx3stn_atolla_AtollaMediaUploader_nativeRun(JNIEnv* /*env*/, jobject /*thiz*/) {
    atolla_media_uploader_run();
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_tx3stn_atolla_AtollaMediaUploader_nativeSetTarget(
    JNIEnv* env, jobject /*thiz*/, jstring host, jint port, jstring token) {
    const char* hostChars = env->GetStringUTFChars(host, nullptr);
    const char* tokenChars = env->GetStringUTFChars(token, nullptr);

    const bool set = atolla_media_uploader_set_target(
        reinterpret_cast<const uint8_t*>(hostChars),
        static_cast<size_t>(env->GetStringUTFLength(host)),
        static_cast<uint16_t>(port),
        reinterpret_cast<const uint8_t*>(tokenChars),
        static_cast<size_t>(env->GetStringUTFLength(token)));

    env->ReleaseStringUTFChars(token, tokenChars);
    env->ReleaseStringUTFChars(host, hostChars);

    return set ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_tx3stn_atolla_AtollaMediaUploader_nativeSetWindow(JNIEnv* env, jobject /*thiz*/, jstring json) {
    const char* jsonChars = env->GetStringUTFChars(json, nullptr);

    const bool set = atolla_media_uploader_set_window(
        reinterpret_cast<const uint8_t*>(jsonChars),
        static_cast<size_t>(env->GetStringUTFLength(json)));

    env->ReleaseStringUTFChars(json, jsonChars);

    return set ? JNI_TRUE : JNI_FALSE;
}
