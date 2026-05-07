#pragma once
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

// Extract and normalise a 100-point float32 amplitude array from interleaved
// float32 PCM samples. Returns a malloc'd float32[100] buffer; caller must free.
// out_num_amps receives the count (always 100 on success).
// Returns null if inputs are invalid or allocation fails.
float* atolla_extract_waveform_amps(
    const float* samples,
    uint32_t sample_count,
    uint32_t channel_count,
    uint32_t* out_num_amps
);

#ifdef __cplusplus
}
#endif
