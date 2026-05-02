#pragma once
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

// Generate a greyscale alpha-mask PNG from interleaved float32 PCM samples.
//   samples:       interleaved PCM, float32 in [-1.0, 1.0]
//   sample_count:  total number of floats (frames × channel_count)
//   channel_count: number of audio channels
//   width:         output image width (waveform columns)
//   height:        output image height in pixels
//   out_len:       receives the byte count of the returned buffer
// Returns a malloc'd byte buffer containing the PNG, or NULL on failure.
// The caller must pass the returned pointer to free() when done.
uint8_t* atolla_generate_waveform(
    const float* samples,
    uint32_t sample_count,
    uint32_t channel_count,
    uint32_t width,
    uint32_t height,
    uint32_t* out_len
);

// Generate a greyscale alpha-mask PNG from pre-computed amplitude control points.
// Catmull-Rom spline interpolation is applied to produce smooth curves at full
// image resolution.
//   amps:      peak amplitude per control point, float32, length = num_amps
//   num_amps:  number of control points (typically ~100)
//   img_width: output image width in pixels
//   height:    output image height in pixels
//   out_len:   receives the byte count of the returned buffer
// Returns a malloc'd byte buffer containing the PNG, or NULL on failure.
// The caller must pass the returned pointer to free() when done.
uint8_t* atolla_render_waveform_from_amps(
    const float* amps,
    uint32_t num_amps,
    uint32_t img_width,
    uint32_t height,
    uint32_t* out_len
);

#ifdef __cplusplus
}
#endif
