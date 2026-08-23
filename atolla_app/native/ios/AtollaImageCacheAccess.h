#pragma once
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

// lets code outside the image loader ask whether an image is already cached, without exposing the
// cache store itself. the loader registers the resolver on init; callers that run before that (or
// on a build without the loader) get nil and fall back to their own fetch.
typedef NSString *_Nullable (^AtollaCachedImageResolver)(NSString *category, NSString *identity);

void AtollaSetCachedImageResolver(AtollaCachedImageResolver _Nullable resolver);

// returns a file:// url for the cached bytes, or nil when nothing is cached for this address
NSString *_Nullable AtollaResolveCachedImageFileUrl(NSString *category, NSString *identity);

NS_ASSUME_NONNULL_END
