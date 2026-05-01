#import "blur_ios_bridge.h"
#import <CoreGraphics/CoreGraphics.h>
#import <UIKit/UIKit.h>
#include <stdlib.h>
#include "image_blur.h"

static const uint32_t kBlurOutputSize = 200;

@implementation AtollaBlurProcessor

+ (nullable NSData *)blurImageData:(nonnull NSData *)imageData {
    CGDataProviderRef provider = CGDataProviderCreateWithCFData((__bridge CFDataRef)imageData);
    if (!provider) return nil;

    // Try PNG first, then JPEG — matches the palette bridge convention.
    CGImageRef image = CGImageCreateWithPNGDataProvider(provider, NULL, false, kCGRenderingIntentDefault);
    if (!image) {
        image = CGImageCreateWithJPEGDataProvider(provider, NULL, false, kCGRenderingIntentDefault);
    }
    CGDataProviderRelease(provider);
    if (!image) return nil;

    const size_t width = CGImageGetWidth(image);
    const size_t height = CGImageGetHeight(image);

    // Decode to RGBA bytes (kCGBitmapByteOrder32Big | kCGImageAlphaPremultipliedLast → RGBA in memory).
    uint8_t *pixels_in = (uint8_t *)calloc(height * width * 4, 1);
    if (!pixels_in) { CGImageRelease(image); return nil; }

    CGColorSpaceRef space = CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
    CGContextRef ctx = CGBitmapContextCreate(
        pixels_in, width, height, 8, width * 4, space,
        kCGBitmapByteOrder32Big | kCGImageAlphaPremultipliedLast);
    CGColorSpaceRelease(space);

    if (!ctx) { free(pixels_in); CGImageRelease(image); return nil; }
    CGContextDrawImage(ctx, CGRectMake(0, 0, (CGFloat)width, (CGFloat)height), image);
    CGContextRelease(ctx);
    CGImageRelease(image);

    const size_t out_bytes = kBlurOutputSize * kBlurOutputSize * 4;
    uint8_t *pixels_out = (uint8_t *)malloc(out_bytes);
    if (!pixels_out) { free(pixels_in); return nil; }

    atolla_blur_pixels(pixels_in, (uint32_t)width, (uint32_t)height,
                       pixels_out, kBlurOutputSize, kBlurOutputSize);
    free(pixels_in);

    // Wrap output RGBA in a CGBitmapContext to produce a CGImage, then JPEG-encode.
    CGColorSpaceRef outSpace = CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
    CGContextRef outCtx = CGBitmapContextCreate(
        pixels_out, kBlurOutputSize, kBlurOutputSize, 8, kBlurOutputSize * 4, outSpace,
        kCGBitmapByteOrder32Big | kCGImageAlphaPremultipliedLast);
    CGColorSpaceRelease(outSpace);

    if (!outCtx) { free(pixels_out); return nil; }
    CGImageRef outImage = CGBitmapContextCreateImage(outCtx);
    CGContextRelease(outCtx);
    free(pixels_out);

    if (!outImage) return nil;
    UIImage *uiImage = [UIImage imageWithCGImage:outImage];
    CGImageRelease(outImage);

    return UIImageJPEGRepresentation(uiImage, 0.9);
}

@end
