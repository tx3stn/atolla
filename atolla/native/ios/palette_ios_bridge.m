#import "palette_ios_bridge.h"
#include <stdio.h>
#include "palette_extractor.h"

@implementation AtollaPaletteExtractor

+ (nullable NSString *)extractPaletteFromData:(nonnull NSData *)imageData {
    AtollaPalette palette;
    if (!atolla_extract_palette_from_bytes(
            (const uint8_t *)imageData.bytes, imageData.length, &palette)) {
        return nil;
    }
    char json[256];
    snprintf(json, sizeof(json),
        "{\"primary\":{\"hex\":\"%s\"},\"accent\":{\"hex\":\"%s\"},"
        "\"surface\":{\"hex\":\"%s\"},\"on_surface\":{\"hex\":\"%s\"},"
        "\"muted_on_surface\":{\"hex\":\"%s\"}}",
        palette.primary, palette.accent, palette.surface,
        palette.on_surface, palette.muted_on_surface);
    return [NSString stringWithUTF8String:json];
}

@end
