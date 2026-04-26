#import "palette_ios_bridge.h"
#import <CoreGraphics/CoreGraphics.h>
#include <stdlib.h>
#include <stdio.h>
#include "palette_extractor.h"

@implementation AtollaPaletteExtractor

+ (nullable NSString *)extractPaletteFromData:(nonnull NSData *)imageData {
    CGDataProviderRef provider = CGDataProviderCreateWithCFData((__bridge CFDataRef)imageData);
    if (!provider) return nil;

    // Try PNG first, then JPEG.
    CGImageRef image = CGImageCreateWithPNGDataProvider(provider, NULL, false, kCGRenderingIntentDefault);
    if (!image) {
        image = CGImageCreateWithJPEGDataProvider(provider, NULL, false, kCGRenderingIntentDefault);
    }
    CGDataProviderRelease(provider);
    if (!image) return nil;

    const size_t width = CGImageGetWidth(image);
    const size_t height = CGImageGetHeight(image);
    const size_t bytesPerRow = width * 4;

    uint8_t *pixels = (uint8_t *)calloc(height * bytesPerRow, 1);
    if (!pixels) {
        CGImageRelease(image);
        return nil;
    }

    CGColorSpaceRef space = CGColorSpaceCreateDeviceRGB();
    // kCGBitmapByteOrder32Big | kCGImageAlphaPremultipliedLast → RGBA byte order in memory.
    CGContextRef ctx = CGBitmapContextCreate(
        pixels, width, height, 8, bytesPerRow, space,
        kCGBitmapByteOrder32Big | kCGImageAlphaPremultipliedLast);
    CGColorSpaceRelease(space);

    if (!ctx) {
        free(pixels);
        CGImageRelease(image);
        return nil;
    }

    CGContextDrawImage(ctx, CGRectMake(0, 0, (CGFloat)width, (CGFloat)height), image);
    CGContextRelease(ctx);
    CGImageRelease(image);

    AtollaPalette palette;
    atolla_extract_palette(pixels, (uint32_t)width, (uint32_t)height, &palette);
    free(pixels);

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
