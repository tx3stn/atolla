#pragma once
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

// pure, framework-free fallback logic shared by the image loader. extracted so it can be unit
// tested on the host without UIKit/Valdi (image decode, disk cache), mirroring
// AtollaImageFallback.kt / AtollaPlaybackGuards on Android.

// when a full-size variant isn't cached we serve its smaller thumbnail so something displays
// (the full variant keeps downloading and swaps in on the next render). the thumb sibling of an
// eligible full variant is the category + "_thumb"; categories without a smaller variant (thumbs
// themselves, logos, genre art, blurred) return nil
NSString *_Nullable AtollaThumbFallbackCategory(NSString *category);

// cache keys to try, in order, when generating the blurred backdrop. the blur is downsampled to
// 200x200 before storing, so the thumb is plenty and is preferred over the full original; this
// lets the backdrop render offline whenever the thumb is downloaded, even if the full album_art
// is still missing. only when neither is cached should the caller fetch
NSArray<NSString *> *AtollaBlurSourceKeys(NSString *identity);

// stable, token-free cache identity for a Jellyfin image URL. every image URL carries the entity
// id in its path (/Items/{id}/Images/{type}) — albumId for album_art, artistId for artist images,
// etc. — so the cache keys on "<id>:<tag>" (the tag busts the cache when the art is replaced on
// the server) rather than the whole URL. non-Jellyfin URLs fall back to the URL with api_key
// stripped so a token can never reach a cache key.
NSString *AtollaImageCacheIdentity(NSString *url);

NS_ASSUME_NONNULL_END
