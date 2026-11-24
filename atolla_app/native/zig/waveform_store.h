#pragma once
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define ATOLLA_WAVEFORM_STORE_MAX_BYTES (300 * sizeof(float))

void atolla_waveform_store_clear(const uint8_t* dir, size_t dir_len);

uint32_t atolla_waveform_store_count(const uint8_t* dir, size_t dir_len);

bool atolla_waveform_store_has(const uint8_t* dir, size_t dir_len, const uint8_t* track_id, size_t track_id_len);

// TODO(waveform-migration): remove once it's been long enough that all uses of old waveform cache have been replaced
uint32_t atolla_waveform_store_migrate(
    const uint8_t* dir,
    size_t dir_len,
    const uint8_t* records_json,
    size_t records_json_len
);

bool atolla_waveform_store_read(
    const uint8_t* dir,
    size_t dir_len,
    const uint8_t* track_id,
    size_t track_id_len,
    uint8_t* out,
    size_t* out_len
);

bool atolla_waveform_store_write(
    const uint8_t* dir,
    size_t dir_len,
    const uint8_t* track_id,
    size_t track_id_len,
    const uint8_t* amps,
    size_t amps_len
);

#ifdef __cplusplus
}
#endif
