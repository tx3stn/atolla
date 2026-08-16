#include <jni.h>
#include <cstdio>
#include <cstdlib>
#include <cstdint>
#include <vector>
#include "palette_extractor.h"

// Accepts pre-decoded ARGB_8888 pixels from Android's Bitmap.getPixels().
// Supports all formats BitmapFactory can decode (WebP, JPEG, PNG, etc.).
extern "C" JNIEXPORT jstring JNICALL
Java_com_tx3stn_atolla_AtollaCacheImageLoader_nativeExtractPaletteFromPixels(
    JNIEnv* env, jobject /*thiz*/, jintArray pixels, jint width, jint height) {

    const jsize len = env->GetArrayLength(pixels);
    if (len <= 0 || width <= 0 || height <= 0) return nullptr;
    if (static_cast<int64_t>(width) * static_cast<int64_t>(height) > len) return nullptr;

    jint* argb = env->GetIntArrayElements(pixels, nullptr);
    if (!argb) return nullptr;

    // Android ARGB_8888: 0xAARRGGBB → unpack to RGBA bytes expected by atolla_extract_palette
    std::vector<uint8_t> rgba(static_cast<size_t>(len) * 4);
    for (jsize i = 0; i < len; i++) {
        const uint32_t px = static_cast<uint32_t>(argb[i]);
        rgba[i * 4 + 0] = (px >> 16) & 0xff; // R
        rgba[i * 4 + 1] = (px >>  8) & 0xff; // G
        rgba[i * 4 + 2] =  px        & 0xff; // B
        rgba[i * 4 + 3] = (px >> 24) & 0xff; // A
    }
    env->ReleaseIntArrayElements(pixels, argb, JNI_ABORT);

    AtollaPalette palette;
    if (!atolla_extract_palette(rgba.data(), static_cast<uint32_t>(width),
                                static_cast<uint32_t>(height), &palette)) {
        return nullptr;
    }

    char json[256];
    std::snprintf(json, sizeof(json),
        "{\"accent\":{\"hex\":\"%s\"},"
        "\"surface\":{\"hex\":\"%s\"},\"on_surface\":{\"hex\":\"%s\"},"
        "\"muted_on_surface\":{\"hex\":\"%s\"}}",
        palette.accent, palette.surface,
        palette.on_surface, palette.muted_on_surface);
    return env->NewStringUTF(json);
}
