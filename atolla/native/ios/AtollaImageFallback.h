#pragma once
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

// Pure, framework-free fallback logic shared by the image loader. Extracted so it can be unit
// tested on the host without UIKit/Valdi (image decode, disk cache), mirroring
// AtollaImageFallback.kt / AtollaPlaybackGuards on Android.

// When a full-size variant isn't cached we serve its smaller thumbnail so something displays (the
// full variant keeps downloading in the background and swaps in on the next render). The thumb
// sibling of an eligible full variant is simply the category + "_thumb"; categories without a
// smaller variant (thumbs themselves, logos, genre art, blurred) return nil.
NSString *_Nullable AtollaThumbFallbackCategory(NSString *category);

// Cache keys to try, in order, when generating the blurred backdrop. The blur is downsampled to
// 200x200 before it is stored, so the thumb is more than enough and is preferred over the full
// original — this lets the backdrop render offline whenever the thumb is downloaded, even if the
// full album_art is still missing. Only when neither is cached should the caller fetch.
NSArray<NSString *> *AtollaBlurSourceKeys(NSString *sourceURL);

NS_ASSUME_NONNULL_END
