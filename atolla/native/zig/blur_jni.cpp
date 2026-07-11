#include <jni.h>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include "image_blur.h"

extern "C" JNIEXPORT jintArray JNICALL
Java_com_tx3stn_atolla_AtollaCacheImageLoader_nativeBlurPixels(
    JNIEnv* env, jobject /*thiz*/,
    jintArray pixels, jint width, jint height,
    jint out_width, jint out_height) {

    const jsize len = env->GetArrayLength(pixels);
    if (len <= 0 || width <= 0 || height <= 0 || out_width <= 0 || out_height <= 0) return nullptr;
    if (static_cast<int64_t>(width) * static_cast<int64_t>(height) > len) return nullptr;

    jint* argb = env->GetIntArrayElements(pixels, nullptr);
    if (!argb) return nullptr;

    // Android Bitmap.getPixels() returns 0xAARRGGBB; Zig expects row-major RGBA bytes
    uint8_t* rgba_in = static_cast<uint8_t*>(std::malloc(static_cast<size_t>(len) * 4));
    if (!rgba_in) {
        env->ReleaseIntArrayElements(pixels, argb, JNI_ABORT);
        return nullptr;
    }
    for (jsize i = 0; i < len; i++) {
        const uint32_t px = static_cast<uint32_t>(argb[i]);
        rgba_in[i * 4 + 0] = (px >> 16) & 0xff; // R
        rgba_in[i * 4 + 1] = (px >>  8) & 0xff; // G
        rgba_in[i * 4 + 2] = (px >>  0) & 0xff; // B
        rgba_in[i * 4 + 3] = (px >> 24) & 0xff; // A
    }
    env->ReleaseIntArrayElements(pixels, argb, JNI_ABORT);

    const size_t out_len = static_cast<size_t>(out_width) * static_cast<size_t>(out_height);
    uint8_t* rgba_out = static_cast<uint8_t*>(std::malloc(out_len * 4));
    if (!rgba_out) {
        std::free(rgba_in);
        return nullptr;
    }
    // zero-init so if atolla_blur_pixels returns early (e.g. internal malloc failure), rgba_out
    // holds valid black pixels rather than uninitialized heap garbage
    std::memset(rgba_out, 0, out_len * 4);

    atolla_blur_pixels(
        rgba_in,
        static_cast<uint32_t>(width), static_cast<uint32_t>(height),
        rgba_out,
        static_cast<uint32_t>(out_width), static_cast<uint32_t>(out_height));
    std::free(rgba_in);

    // RGBA bytes → Android 0xAARRGGBB
    jintArray result = env->NewIntArray(static_cast<jsize>(out_len));
    if (!result) { std::free(rgba_out); return nullptr; }
    jint* out_argb = env->GetIntArrayElements(result, nullptr);
    if (!out_argb) { std::free(rgba_out); return nullptr; }
    for (size_t i = 0; i < out_len; i++) {
        const uint32_t r = rgba_out[i * 4 + 0];
        const uint32_t g = rgba_out[i * 4 + 1];
        const uint32_t b = rgba_out[i * 4 + 2];
        const uint32_t a = rgba_out[i * 4 + 3];
        out_argb[i] = static_cast<jint>((a << 24) | (r << 16) | (g << 8) | b);
    }
    env->ReleaseIntArrayElements(result, out_argb, 0);
    std::free(rgba_out);
    return result;
}
