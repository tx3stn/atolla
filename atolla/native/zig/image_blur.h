#pragma once
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

// Blur RGBA pixel data using iterative bilinear downsampling followed by a
// two-step upsample (approximates Gaussian blur, identical on iOS and Android).
// pixels_in:  row-major RGBA bytes (4 bytes per pixel), width_in × height_in
// pixels_out: caller-allocated RGBA buffer, width_out × height_out × 4 bytes
void atolla_blur_pixels(
    const uint8_t* pixels_in,
    uint32_t width_in,
    uint32_t height_in,
    uint8_t* pixels_out,
    uint32_t width_out,
    uint32_t height_out
);

#ifdef __cplusplus
}
#endif
