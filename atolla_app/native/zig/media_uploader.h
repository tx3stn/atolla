#pragma once
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

void atolla_media_uploader_init(void);

void atolla_media_uploader_run(void);

bool atolla_media_uploader_set_target(
    const uint8_t* host,
    size_t host_len,
    uint16_t port,
    const uint8_t* token,
    size_t token_len
);

bool atolla_media_uploader_set_window(const uint8_t* json, size_t json_len);

#ifdef __cplusplus
}
#endif
