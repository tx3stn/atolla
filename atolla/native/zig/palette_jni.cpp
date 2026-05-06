#include <jni.h>
#include <cstdio>
#include <cstdlib>
#include "palette_extractor.h"

extern "C" JNIEXPORT jstring JNICALL
Java_com_tx3stn_atolla_AtollaCacheImageLoader_nativeExtractPaletteFromBytes(
    JNIEnv* env, jobject /*thiz*/, jbyteArray bytes) {

    const jsize len = env->GetArrayLength(bytes);
    jbyte* buf = env->GetByteArrayElements(bytes, nullptr);
    if (!buf) return nullptr;

    AtollaPalette palette;
    const bool ok = atolla_extract_palette_from_bytes(
        reinterpret_cast<const uint8_t*>(buf),
        static_cast<size_t>(len),
        &palette);
    env->ReleaseByteArrayElements(bytes, buf, JNI_ABORT);

    if (!ok) return nullptr;

    char json[256];
    std::snprintf(json, sizeof(json),
        "{\"primary\":{\"hex\":\"%s\"},\"accent\":{\"hex\":\"%s\"},"
        "\"surface\":{\"hex\":\"%s\"},\"on_surface\":{\"hex\":\"%s\"},"
        "\"muted_on_surface\":{\"hex\":\"%s\"}}",
        palette.primary, palette.accent, palette.surface,
        palette.on_surface, palette.muted_on_surface);

    return env->NewStringUTF(json);
}
