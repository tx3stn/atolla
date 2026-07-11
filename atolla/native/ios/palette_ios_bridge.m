#import "palette_ios_bridge.h"
#import "atolla/native/ios/AtollaBoundedImageDecode.h"
#include "palette_extractor.h"

@implementation AtollaPaletteExtractor

+ (nullable NSString *)extractPaletteFromData:(nonnull NSData *)imageData {
    CGImageRef cgImage = AtollaCreateBoundedCGImage(imageData, ATOLLA_PROCESSING_MAX_PIXEL_SIZE);
    if (!cgImage) return nil;

    const size_t width = CGImageGetWidth(cgImage);
    const size_t height = CGImageGetHeight(cgImage);
    if (width == 0 || height == 0) {
        CGImageRelease(cgImage);
        return nil;
    }

    uint8_t *pixels = calloc(width * height * 4, 1);
    if (!pixels) {
        CGImageRelease(cgImage);
        return nil;
    }

    CGColorSpaceRef colorSpace = CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
    CGContextRef ctx = CGBitmapContextCreate(pixels, width, height, 8, width * 4,
        colorSpace, kCGImageAlphaNoneSkipLast | kCGBitmapByteOrderDefault);
    CGColorSpaceRelease(colorSpace);

    if (!ctx) {
        free(pixels);
        CGImageRelease(cgImage);
        return nil;
    }

    CGContextDrawImage(ctx, CGRectMake(0, 0, width, height), cgImage);
    CGContextRelease(ctx);
    CGImageRelease(cgImage);

    AtollaPalette palette;
    const bool ok = atolla_extract_palette(pixels, (uint32_t)width, (uint32_t)height, &palette);
    free(pixels);
    if (!ok) return nil;

    char json[256];
    snprintf(json, sizeof(json),
        "{\"accent\":{\"hex\":\"%s\"},"
        "\"surface\":{\"hex\":\"%s\"},\"on_surface\":{\"hex\":\"%s\"},"
        "\"muted_on_surface\":{\"hex\":\"%s\"}}",
        palette.accent, palette.surface,
        palette.on_surface, palette.muted_on_surface);
    return [NSString stringWithUTF8String:json];
}

@end
