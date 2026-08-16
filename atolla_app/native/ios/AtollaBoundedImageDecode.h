#pragma once
#import <CoreGraphics/CoreGraphics.h>
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

// the longest edge the palette and blur decoders downsample album art to. bounding the decode this
// way stops a small file that declares huge dimensions from forcing a multi-gigabyte allocation
#define ATOLLA_PROCESSING_MAX_PIXEL_SIZE 512

// decode image data straight to a thumbnail whose largest edge is capped at maxPixelSize, so the
// full-resolution bitmap is never allocated. returns NULL if the bytes aren't a decodable image;
// the caller owns the result and must CGImageRelease it
CGImageRef _Nullable AtollaCreateBoundedCGImage(NSData *data, size_t maxPixelSize) CF_RETURNS_RETAINED;

NS_ASSUME_NONNULL_END
