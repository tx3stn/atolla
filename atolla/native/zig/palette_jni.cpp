#include <jni.h>
#include <cstdio>
#include <cstdlib>
#include "palette_extractor.h"

extern "C" JNIEXPORT jstring JNICALL
Java_atolla_native_android_AtollaCacheImageLoader_nativeExtractPalette(
    JNIEnv* env, jobject /*thiz*/, jintArray pixels, jint width, jint height) {

    const jsize len = env->GetArrayLength(pixels);
    jint* argb = env->GetIntArrayElements(pixels, nullptr);
    if (!argb) return nullptr;

    // Android Bitmap.getPixels() returns 0xAARRGGBB; Zig expects row-major RGBA bytes.
    uint8_t* rgba = static_cast<uint8_t*>(std::malloc(static_cast<size_t>(len) * 4));
    if (!rgba) {
        env->ReleaseIntArrayElements(pixels, argb, JNI_ABORT);
        return nullptr;
    }
    for (jsize i = 0; i < len; i++) {
        const uint32_t px = static_cast<uint32_t>(argb[i]);
        rgba[i * 4 + 0] = (px >> 16) & 0xff; // R
        rgba[i * 4 + 1] = (px >>  8) & 0xff; // G
        rgba[i * 4 + 2] = (px >>  0) & 0xff; // B
        rgba[i * 4 + 3] = (px >> 24) & 0xff; // A
    }
    env->ReleaseIntArrayElements(pixels, argb, JNI_ABORT);

    AtollaPalette palette;
    atolla_extract_palette(rgba, static_cast<uint32_t>(width), static_cast<uint32_t>(height), &palette);
    std::free(rgba);

    char json[256];
    std::snprintf(json, sizeof(json),
        "{\"primary\":{\"hex\":\"%s\"},\"accent\":{\"hex\":\"%s\"},"
        "\"surface\":{\"hex\":\"%s\"},\"on_surface\":{\"hex\":\"%s\"},"
        "\"muted_on_surface\":{\"hex\":\"%s\"}}",
        palette.primary, palette.accent, palette.surface,
        palette.on_surface, palette.muted_on_surface);

    return env->NewStringUTF(json);
}
