#pragma once
#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

// Build the closed waveform outline from `num_amps` raw per-column RMS amps.
// Smooths + normalises internally, then writes a flat float stream to out_pts:
//   [0..1]                       start point (moveTo target)
//   then (2 * num_amps - 1) cubic segments, 6 floats each:
//                                cp1x, cp1y, cp2x, cp2y, endx, endy
// Segment order: top edge left→right, the straight right cap (a degenerate cubic
// that renders as a line), then the bottom edge right→left. The caller issues
// moveTo(start), one cubicTo per segment, then closePath() for the left cap.
// out_count receives the number of floats written: 2 + (2 * num_amps - 1) * 6.
// Returns false on invalid input (num_amps < 2) or if out_capacity is too small.
bool atolla_waveform_build_path(
    const float* amps,
    uint32_t num_amps,
    float width,
    float height,
    float* out_pts,
    uint32_t out_capacity,
    uint32_t* out_count
);

#ifdef __cplusplus
}
#endif
