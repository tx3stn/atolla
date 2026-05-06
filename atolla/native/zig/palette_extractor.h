#pragma once
#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    char primary[8];         // "#rrggbb\0"
    char accent[8];
    char surface[8];
    char on_surface[8];
    char muted_on_surface[8];
} AtollaPalette;

// Extract a colour palette from raw RGBA pixel data.
// pixels: row-major RGBA bytes (4 bytes per pixel)
// width/height: image dimensions
// out: filled on success; default colours written on failure
// returns: true on success, false if dimensions are zero
bool atolla_extract_palette(
    const uint8_t* pixels,
    uint32_t width,
    uint32_t height,
    AtollaPalette* out
);

// Extract a colour palette from raw PNG or JPEG file bytes.
// bytes: complete file contents (PNG or JPEG)
// len: number of bytes
// out: filled on success; default colours written on failure
// returns: true on success, false if format is unrecognised or parse fails
bool atolla_extract_palette_from_bytes(
    const uint8_t* bytes,
    size_t len,
    AtollaPalette* out
);

#ifdef __cplusplus
}
#endif
