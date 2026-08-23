#import <atolla_appTypes/atolla_appTypes.h>
#import <valdi_core/SCValdiModuleFactoryRegistry.h>
#import <valdi_core/SCValdiImageLoader.h>
#import <valdi_core/SCValdiCancelable.h>
#import <valdi_core/SCValdiConfiguration.h>
#import <valdi_core/SCValdiRuntimeManagerProtocol.h>
#import <Foundation/Foundation.h>
#import <CommonCrypto/CommonDigest.h> // mobsf-ignore: ios_weak_hash
#import <UIKit/UIKit.h>
#import "atolla_app/native/ios/palette_ios_bridge.h"
#import "atolla_app/native/ios/blur_ios_bridge.h"
#import "atolla_app/native/ios/AtollaImageFallback.h"
#import "atolla_app/native/ios/AtollaDiskCacheStats.h"
#import "atolla_app/native/ios/AtollaAuthRedirectGuard.h"
#import "atolla_app/native/ios/AtollaImageCacheAccess.h"

// MARK: - Request Payload

@interface AtollaIOSImageRequestPayload : NSObject
@property (nonatomic, copy) NSString *cacheKey;
@property (nonatomic, copy) NSString *category;
// only consulted when writing: a changed tag means the artwork was replaced on the server. it is
// deliberately not part of cacheKey, so a caller holding only an id still resolves
@property (nonatomic, copy, nullable) NSString *tag;
// nil when the caller has an id but no URL, which is the offline case: a cache hit needs no URL
// and a miss has nowhere to fetch from
@property (nonatomic, strong, nullable) NSURL *sourceURL;
@end

@implementation AtollaIOSImageRequestPayload
@end

// MARK: - Cancelables

@interface AtollaURLTaskCancelable : NSObject <SCValdiCancelable>
- (instancetype)initWithTask:(NSURLSessionDataTask *)task;
@end

@implementation AtollaURLTaskCancelable {
    NSURLSessionDataTask *_task;
}
- (instancetype)initWithTask:(NSURLSessionDataTask *)task {
    self = [super init];
    if (self) { _task = task; }
    return self;
}
- (void)cancel { [_task cancel]; }
@end

@interface AtollaNoopCancelable : NSObject <SCValdiCancelable>
@end
@implementation AtollaNoopCancelable
- (void)cancel {}
@end

// MARK: - Disk + Memory Cache

static NSInteger sImageDiskCacheMaxBytes = 200 * 1024 * 1024;

@interface AtollaIOSImageCacheStore : NSObject
- (nullable NSData *)readForKey:(NSString *)key;
- (void)writeData:(NSData *)data forKey:(NSString *)key;
- (void)removeForKey:(NSString *)key;
- (nullable NSString *)fileUrlForKey:(NSString *)key;
- (void)clearCategories:(NSArray<NSString *> *)categories;
- (void)setDiskCacheMaxBytes:(NSInteger)bytes;
- (NSInteger)entryCount;
- (long long)totalBytes;
- (NSInteger)diskEntryCount;
- (long long)diskBytes;
- (NSString *)diskCategoryCountsJson;
- (void)diskStatsSnapshotWithCompletion:(void (^)(NSInteger count, long long bytes, NSString *categoryCountsJson))completion;
@end

@implementation AtollaIOSImageCacheStore {
    NSCache<NSString *, NSData *> *_mem;
    NSURL *_diskDir;
    dispatch_queue_t _diskQ;
}

- (instancetype)init {
    self = [super init];
    if (self) {
        _mem = [[NSCache alloc] init];
        _mem.totalCostLimit = 50 * 1024 * 1024;
        _diskQ = dispatch_queue_create("atolla.image.cache", DISPATCH_QUEUE_SERIAL);
        NSURL *caches = [NSFileManager.defaultManager URLsForDirectory:NSCachesDirectory
                                                             inDomains:NSUserDomainMask].firstObject;
        if (caches) {
            _diskDir = [caches URLByAppendingPathComponent:@"atolla-image-cache"];
            [NSFileManager.defaultManager createDirectoryAtURL:_diskDir
                                  withIntermediateDirectories:YES
                                                   attributes:nil
                                                        error:nil];
        }
    }
    return self;
}

- (nullable NSData *)readForKey:(NSString *)key {
    NSData *hit = [_mem objectForKey:key];
    if (hit) return hit;
    NSURL *file = [self diskFileForKey:key];
    if (!file || ![NSFileManager.defaultManager fileExistsAtPath:file.path]) return nil;
    NSData *data = [NSData dataWithContentsOfURL:file];
    if (!data) return nil;
    [file setResourceValue:NSDate.date forKey:NSURLContentModificationDateKey error:nil];
    [_mem setObject:data forKey:key cost:data.length];
    return data;
}

- (void)removeForKey:(NSString *)key {
    [_mem removeObjectForKey:key];
    NSURL *file = [self diskFileForKey:key];
    if (file) [NSFileManager.defaultManager removeItemAtURL:file error:nil];
}

// path to the cached bytes without loading them, for callers that hand a file to the system
// (lock-screen artwork) rather than decoding it themselves
- (nullable NSString *)fileUrlForKey:(NSString *)key {
    NSURL *file = [self diskFileForKey:key];
    if (!file || ![NSFileManager.defaultManager fileExistsAtPath:file.path]) return nil;
    [file setResourceValue:NSDate.date forKey:NSURLContentModificationDateKey error:nil];
    return file.absoluteString;
}

- (void)writeData:(NSData *)data forKey:(NSString *)key {
    [_mem setObject:data forKey:key cost:data.length];
    dispatch_async(_diskQ, ^{
        NSURL *file = [self diskFileForKey:key];
        if (!file) return;
        [data writeToURL:file atomically:YES];
        [self evictIfNeeded];
    });
}

- (void)clearCategories:(NSArray<NSString *> *)categories {
    NSMutableSet<NSString *> *expanded = [NSMutableSet setWithArray:categories];
    if ([expanded containsObject:@"album_art"])
        [expanded addObjectsFromArray:@[@"album_art_blurred", @"album_art_thumb", @"album_art_palette"]];
    [_mem removeAllObjects];
    dispatch_sync(_diskQ, ^{
        if (!self->_diskDir) return;
        NSArray<NSURL *> *files = [NSFileManager.defaultManager
            contentsOfDirectoryAtURL:self->_diskDir
            includingPropertiesForKeys:nil options:0 error:nil];
        for (NSURL *file in files) {
            NSString *name = file.lastPathComponent;
            for (NSString *cat in expanded) {
                if ([name hasPrefix:[cat stringByAppendingString:@"_"]]) {
                    [NSFileManager.defaultManager removeItemAtURL:file error:nil];
                    break;
                }
            }
        }
    });
}

- (void)setDiskCacheMaxBytes:(NSInteger)bytes {
    sImageDiskCacheMaxBytes = bytes;
}

- (NSInteger)diskEntryCount {
    if (!_diskDir) return 0;
    return (NSInteger)[[NSFileManager.defaultManager contentsOfDirectoryAtPath:_diskDir.path error:nil] count];
}

- (long long)diskBytes {
    if (!_diskDir) return 0;
    NSArray<NSURL *> *files = [NSFileManager.defaultManager
        contentsOfDirectoryAtURL:_diskDir
        includingPropertiesForKeys:@[NSURLFileSizeKey] options:0 error:nil];
    long long total = 0;
    for (NSURL *f in files) {
        NSNumber *sz; [f getResourceValue:&sz forKey:NSURLFileSizeKey error:nil];
        total += sz.longLongValue;
    }
    return total;
}

- (NSInteger)entryCount { return [self diskEntryCount]; }
- (long long)totalBytes { return [self diskBytes]; }

- (NSString *)diskCategoryCountsJson {
    if (!_diskDir) return @"{}";
    NSArray<NSURL *> *files = [NSFileManager.defaultManager
        contentsOfDirectoryAtURL:_diskDir includingPropertiesForKeys:nil options:0 error:nil];
    NSMutableDictionary<NSString *, NSNumber *> *counts = [NSMutableDictionary dictionary];
    for (NSURL *file in files) {
        NSString *name = file.lastPathComponent;
        // filename format: {category}_{sha256_64_hex}. SHA-256 is always 64 hex chars; strip
        // the trailing 65 chars (underscore + hash)
        if (name.length < 66) continue;
        NSString *cat = [name substringToIndex:name.length - 65];
        counts[cat] = @(counts[cat].intValue + 1);
    }
    NSMutableString *json = [NSMutableString stringWithString:@"{"];
    __block BOOL first = YES;
    [counts enumerateKeysAndObjectsUsingBlock:^(NSString *k, NSNumber *v, BOOL *stop) {
        if (!first) [json appendString:@","];
        [json appendFormat:@"\"%@\":%@", k, v];
        first = NO;
    }];
    [json appendString:@"}"];
    return json;
}

// single directory scan producing count, bytes and per-category counts together, off the
// calling thread, so the JS thread never blocks on disk I/O
- (void)diskStatsSnapshotWithCompletion:(void (^)(NSInteger count, long long bytes, NSString *categoryCountsJson))completion {
    NSURL *dir = _diskDir;
    dispatch_async(_diskQ, ^{
        AtollaDiskStatsSnapshot *snapshot = [AtollaDiskCacheStats scanDirectory:dir];
        completion(snapshot.count, snapshot.bytes, snapshot.categoryCountsJson);
    });
}

- (NSURL *)diskFileForKey:(NSString *)key {
    if (!_diskDir) return nil;
    NSString *cat = [key componentsSeparatedByString:@":"].firstObject ?: @"unknown";
    return [_diskDir URLByAppendingPathComponent:
            [NSString stringWithFormat:@"%@_%@", cat, [self sha256:key]]];
}

- (void)evictIfNeeded {
    if (sImageDiskCacheMaxBytes <= 0) return;
    if (!_diskDir) return;
    NSArray<NSURL *> *files = [NSFileManager.defaultManager
        contentsOfDirectoryAtURL:_diskDir
        includingPropertiesForKeys:@[NSURLFileSizeKey, NSURLContentModificationDateKey]
        options:0 error:nil];
    NSMutableArray *live = [NSMutableArray array];
    long long total = 0;
    for (NSURL *f in files) {
        NSDate *mod; NSNumber *sz;
        [f getResourceValue:&mod forKey:NSURLContentModificationDateKey error:nil];
        [f getResourceValue:&sz forKey:NSURLFileSizeKey error:nil];
        if (!mod || !sz) continue;
        [live addObject:@{@"u": f, @"s": sz, @"m": mod}];
        total += sz.longLongValue;
    }
    if (total <= sImageDiskCacheMaxBytes) return;
    NSArray *sorted = [live sortedArrayUsingComparator:^NSComparisonResult(NSDictionary *a, NSDictionary *b) {
        return [a[@"m"] compare:b[@"m"]];
    }];
    for (NSDictionary *e in sorted) {
        if (total <= sImageDiskCacheMaxBytes) break;
        [NSFileManager.defaultManager removeItemAtURL:e[@"u"] error:nil];
        total -= [e[@"s"] longLongValue];
    }
}

- (NSString *)sha256:(NSString *)s {
    NSData *d = [s dataUsingEncoding:NSUTF8StringEncoding];
    if (!d) return [NSString stringWithFormat:@"%ld", (long)s.hash];
    uint8_t digest[CC_SHA256_DIGEST_LENGTH];
    CC_SHA256(d.bytes, (CC_LONG)d.length, digest);
    NSMutableString *hex = [NSMutableString stringWithCapacity:CC_SHA256_DIGEST_LENGTH * 2];
    for (int i = 0; i < CC_SHA256_DIGEST_LENGTH; i++) [hex appendFormat:@"%02x", digest[i]];
    return hex;
}

@end

// MARK: - Image Loader

@interface AtollaIOSImageLoader : NSObject <SCValdiImageLoader>
// current Jellyfin access token, pushed out-of-band on session change; applied as an auth
// header on network fetches so the token never travels in an image URL. atomic for the
// cross-thread set (session change) vs read (background fetch)
@property (atomic, copy, nullable) NSString *authToken;
+ (instancetype)sharedInstance;
- (nullable NSString *)extractPaletteForCategory:(NSString *)category identity:(NSString *)identity;
- (nullable NSString *)resolveCachedFileUrlForCategory:(NSString *)category identity:(NSString *)identity;
- (void)preloadSource:(NSString *)source;
- (void)clearCategories:(NSArray<NSString *> *)categories;
- (void)setDiskCacheMaxBytes:(NSInteger)bytes;
- (void)setImageCachedObserver:(void (^)(NSString *url, NSString *category))observer;
- (NSInteger)entryCount;
- (long long)totalBytes;
- (NSInteger)diskEntryCount;
- (long long)diskBytes;
- (NSString *)diskCategoryCountsJson;
- (void)diskStatsSnapshotWithCompletion:(void (^)(NSInteger count, long long bytes, NSString *categoryCountsJson))completion;
@end

@implementation AtollaIOSImageLoader {
    AtollaIOSImageCacheStore *_cache;
    void (^_imageCachedObserver)(NSString *, NSString *);
}

+ (instancetype)sharedInstance {
    static AtollaIOSImageLoader *instance;
    static dispatch_once_t token;
    dispatch_once(&token, ^{ instance = [[AtollaIOSImageLoader alloc] init]; });
    return instance;
}

- (instancetype)init {
    self = [super init];
    if (self) {
        _cache = [[AtollaIOSImageCacheStore alloc] init];
        __weak typeof(self) weakSelf = self;
        AtollaSetCachedImageResolver(^NSString *_Nullable(NSString *category, NSString *identity) {
            return [weakSelf resolveCachedFileUrlForCategory:category identity:identity];
        });
    }
    return self;
}

- (NSArray<NSString *> *)supportedURLSchemes { return @[@"atolla-cache"]; }

- (id)requestPayloadWithURL:(NSURL *)url error:(NSError **)error {
    if (![url.scheme isEqualToString:@"atolla-cache"] || ![url.host isEqualToString:@"image"]) {
        if (error) *error = [NSError errorWithDomain:@"AtollaIOSImageLoader" code:1
                                            userInfo:@{NSLocalizedDescriptionKey: @"Invalid URL scheme/host"}];
        return nil;
    }
    NSURLComponents *c = [NSURLComponents componentsWithURL:url resolvingAgainstBaseURL:NO];
    NSString *category = nil, *sourceURLString = nil, *identity = nil, *tag = nil;
    for (NSURLQueryItem *item in c.queryItems) {
        if ([item.name isEqualToString:@"c"]) category = item.value;
        else if ([item.name isEqualToString:@"u"]) sourceURLString = item.value;
        else if ([item.name isEqualToString:@"id"]) identity = item.value;
        else if ([item.name isEqualToString:@"t"]) tag = item.value;
    }
    NSURL *sourceURL = sourceURLString.length ? [NSURL URLWithString:sourceURLString] : nil;
    NSString *cacheKey = identity.length ? identity : sourceURLString;
    if (!category.length || !cacheKey.length) {
        if (error) *error = [NSError errorWithDomain:@"AtollaIOSImageLoader" code:2
                                            userInfo:@{NSLocalizedDescriptionKey: @"Missing c or id params"}];
        return nil;
    }
    AtollaIOSImageRequestPayload *payload = [[AtollaIOSImageRequestPayload alloc] init];
    payload.category = category;
    payload.sourceURL = sourceURL;
    payload.tag = tag;
    payload.cacheKey = cacheKey;
    return payload;
}

- (NSMutableURLRequest *)imageRequestForURL:(NSURL *)url {
    NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:url];
    NSString *authToken = self.authToken;
    if (authToken.length > 0) {
        [request setValue:authToken forHTTPHeaderField:@"X-Emby-Token"];
        [request setValue:[NSString stringWithFormat:@"MediaBrowser Token=\"%@\"", authToken]
       forHTTPHeaderField:@"Authorization"];
    }
    return request;
}

- (id<SCValdiCancelable>)loadBytesWithRequestPayload:(AtollaIOSImageRequestPayload *)payload
                                          completion:(SCValdiImageLoaderBytesCompletion)completion {
    NSString *key = [NSString stringWithFormat:@"%@:%@", payload.category, payload.cacheKey];
    [self reconcileTagForPayload:payload key:key];
    NSData *cached = [_cache readForKey:key];
    if (cached) {
        completion(cached, nil);
        return [[AtollaNoopCancelable alloc] init];
    }

    // a caller holding only an id has nowhere to fetch from, which is the offline case
    if (!payload.sourceURL) {
        completion(nil, [NSError errorWithDomain:@"AtollaIOSImageLoader" code:3
                                        userInfo:@{NSLocalizedDescriptionKey:
                                                       @"Cache miss with no fetch source"}]);
        return [[AtollaNoopCancelable alloc] init];
    }

    NSMutableURLRequest *request = [self imageRequestForURL:payload.sourceURL];

    if ([payload.category isEqualToString:@"album_art_blurred"]) {
        // the blur is downsampled before storage, so prefer the (always-downloaded) thumb and
        // fall back to the full original; only fetch from network if neither is cached
        NSArray<NSString *> *blurKeys = AtollaBlurSourceKeys(payload.cacheKey);
        // the full-size original is the last key; a network fetch is cached under it below
        NSString *originalKey = blurKeys.lastObject;
        NSData *originalData = nil;
        for (NSString *blurKey in blurKeys) {
            originalData = [_cache readForKey:blurKey];
            if (originalData) break;
        }
        if (originalData) {
            NSData *blurred = [self generateBlurredDataFrom:originalData];
            if (blurred) {
                [_cache writeData:blurred forKey:key];
                completion(blurred, nil);
            } else {
                completion(nil, [NSError errorWithDomain:@"AtollaIOSImageLoader" code:3
                                               userInfo:@{NSLocalizedDescriptionKey: @"blur generation failed"}]);
            }
            return [[AtollaNoopCancelable alloc] init];
        }
        NSURLSessionDataTask *task = [[AtollaAuthRedirectGuard sharedDefaultSession]
            dataTaskWithRequest:request
            completionHandler:^(NSData *data, NSURLResponse *response, NSError *err) {
                if (!data) { completion(nil, err); return; }
                [self->_cache writeData:data forKey:originalKey];
                NSData *blurred = [self generateBlurredDataFrom:data];
                if (blurred) {
                    [self->_cache writeData:blurred forKey:key];
                    completion(blurred, nil);
                } else {
                    completion(nil, [NSError errorWithDomain:@"AtollaIOSImageLoader" code:3
                                                   userInfo:@{NSLocalizedDescriptionKey: @"blur generation failed"}]);
                }
            }];
        [task resume];
        return [[AtollaURLTaskCancelable alloc] initWithTask:task];
    }

    // Full-variant fallback: the requested full-size variant isn't cached. If its thumbnail is,
    // deliver that now so something shows immediately, then fetch the full variant in the
    // background to populate the cache for the next render (without calling completion again).
    NSString *thumbCategory = AtollaThumbFallbackCategory(payload.category);
    if (thumbCategory) {
        NSString *thumbKey = [NSString stringWithFormat:@"%@:%@", thumbCategory, payload.cacheKey];
        NSData *thumbData = [_cache readForKey:thumbKey];
        if (thumbData) {
            completion(thumbData, nil);
            NSURLSessionDataTask *bgTask = [[AtollaAuthRedirectGuard sharedDefaultSession]
                dataTaskWithRequest:request
                completionHandler:^(NSData *data, NSURLResponse *response, NSError *err) {
                    if (!data) { return; }
                    [self->_cache writeData:data forKey:key];
                    if ([payload.category isEqualToString:@"album_art"]) {
                        [self writePaletteSidecarForData:data identity:payload.cacheKey];
                    }
                    if (self->_imageCachedObserver) {
                        self->_imageCachedObserver(payload.sourceURL.absoluteString, payload.category);
                    }
                }];
            [bgTask resume];
            return [[AtollaURLTaskCancelable alloc] initWithTask:bgTask];
        }
    }

    NSURLSessionDataTask *task = [[AtollaAuthRedirectGuard sharedDefaultSession]
        dataTaskWithRequest:request
        completionHandler:^(NSData *data, NSURLResponse *response, NSError *err) {
            if (!data) { completion(nil, err); return; }
            [self->_cache writeData:data forKey:key];
            if ([payload.category isEqualToString:@"album_art"]) {
                [self writePaletteSidecarForData:data identity:payload.cacheKey];
            }
            if (self->_imageCachedObserver) {
                self->_imageCachedObserver(payload.sourceURL.absoluteString, payload.category);
            }
            completion(data, nil);
        }];
    [task resume];
    return [[AtollaURLTaskCancelable alloc] initWithTask:task];
}

- (nullable NSData *)generateBlurredDataFrom:(NSData *)originalData {
    return [AtollaBlurProcessor blurImageData:originalData];
}

- (void)writePaletteSidecarForData:(NSData *)data identity:(NSString *)identity {
    NSString *json = [AtollaPaletteExtractor extractPaletteFromData:data];
    if (!json) return;
    NSData *paletteData = [json dataUsingEncoding:NSUTF8StringEncoding];
    NSString *paletteKey = [NSString stringWithFormat:@"album_art_palette:%@", identity];
    [_cache writeData:paletteData forKey:paletteKey];
}

- (NSString *)tagKeyForPayload:(AtollaIOSImageRequestPayload *)payload {
    return [NSString stringWithFormat:@"%@_tag:%@", payload.category, payload.cacheKey];
}

// the tag is the server's "this artwork changed" signal. it never enters the cache key, so
// reconcile it here: a changed tag drops the cached bytes and lets the normal path refetch,
// while a caller that supplied no tag keeps whatever is cached
- (void)reconcileTagForPayload:(AtollaIOSImageRequestPayload *)payload key:(NSString *)key {
    NSString *tag = payload.tag;
    if (!tag.length) return;

    NSString *tagKey = [self tagKeyForPayload:payload];
    NSData *storedData = [_cache readForKey:tagKey];
    NSString *stored = storedData
        ? [[NSString alloc] initWithData:storedData encoding:NSUTF8StringEncoding]
        : nil;
    if ([stored isEqualToString:tag]) return;

    if (stored) [_cache removeForKey:key];
    [_cache writeData:[tag dataUsingEncoding:NSUTF8StringEncoding] forKey:tagKey];
}

- (nullable NSString *)resolveCachedFileUrlForCategory:(NSString *)category identity:(NSString *)identity {
    if (!category.length || !identity.length) return nil;
    NSString *key = [NSString stringWithFormat:@"%@:%@", category, identity];
    return [_cache fileUrlForKey:key];
}

- (nullable NSString *)extractPaletteForCategory:(NSString *)category identity:(NSString *)identity {
    if ([category isEqualToString:@"album_art"]) {
        NSString *paletteKey = [NSString stringWithFormat:@"album_art_palette:%@", identity];
        NSData *paletteData = [_cache readForKey:paletteKey];
        if (paletteData) {
            return [[NSString alloc] initWithData:paletteData encoding:NSUTF8StringEncoding];
        }
    }
    NSString *key = [NSString stringWithFormat:@"%@:%@", category, identity];
    NSData *data = [_cache readForKey:key];
    if (!data) return nil;
    return [AtollaPaletteExtractor extractPaletteFromData:data];
}

// takes the same atolla-cache:// source strings rendering uses, so a preload can never warm a
// different cache entry than the one a later render reads
- (void)preloadSource:(NSString *)source {
    NSURL *sourceUri = [NSURL URLWithString:source];
    if (!sourceUri) return;
    AtollaIOSImageRequestPayload *payload = [self requestPayloadWithURL:sourceUri error:nil];
    if (!payload) return;

    NSString *category = payload.category;
    NSString *identity = payload.cacheKey;
    NSString *key = [NSString stringWithFormat:@"%@:%@", category, identity];
    [self reconcileTagForPayload:payload key:key];

    NSURL *sourceURL = payload.sourceURL;
    NSString *cleanUrl = sourceURL.absoluteString ?: identity;
    if ([_cache readForKey:key]) {
        // already cached, still report it so offline-availability waiters resolve
        if (_imageCachedObserver) _imageCachedObserver(cleanUrl, category);
        return;
    }
    // nothing cached and nowhere to fetch from: offline, so there is nothing to warm
    if (!sourceURL) return;
    NSMutableURLRequest *request = [self imageRequestForURL:sourceURL];
    NSURLSessionDataTask *task = [[AtollaAuthRedirectGuard sharedDefaultSession]
        dataTaskWithRequest:request
        completionHandler:^(NSData *data, NSURLResponse *r, NSError *e) {
            if (!data) return;
            [self->_cache writeData:data forKey:key];
            if ([category isEqualToString:@"album_art"]) {
                [self writePaletteSidecarForData:data identity:identity];
            }
            if (self->_imageCachedObserver) self->_imageCachedObserver(cleanUrl, category);
        }];
    [task resume];
}

- (void)clearCategories:(NSArray<NSString *> *)categories { [_cache clearCategories:categories]; }
- (void)setDiskCacheMaxBytes:(NSInteger)bytes { [_cache setDiskCacheMaxBytes:bytes]; }
- (void)setImageCachedObserver:(void (^)(NSString *, NSString *))observer { _imageCachedObserver = observer; }
- (NSInteger)entryCount { return _cache.entryCount; }
- (long long)totalBytes { return _cache.totalBytes; }
- (NSInteger)diskEntryCount { return _cache.diskEntryCount; }
- (long long)diskBytes { return _cache.diskBytes; }
- (NSString *)diskCategoryCountsJson { return [_cache diskCategoryCountsJson]; }
- (void)diskStatsSnapshotWithCompletion:(void (^)(NSInteger count, long long bytes, NSString *categoryCountsJson))completion {
    [_cache diskStatsSnapshotWithCompletion:completion];
}

@end

// MARK: - Bootstrap Module

@interface AtollaImageLoaderBootstrapModuleImpl : NSObject <atolla_appImageLoaderBootstrapModule>
@end

@implementation AtollaImageLoaderBootstrapModuleImpl

- (void)ensureAtollaImageLoaderBootstrap {
    AtollaIOSImageLoader *loader = [AtollaIOSImageLoader sharedInstance];
    Class cls = NSClassFromString(@"SCValdiRuntimeManager");
    if (!cls) return;
    NSArray *managers = [cls performSelector:NSSelectorFromString(@"allRuntimeManagers")];
    for (id<SCValdiRuntimeManagerProtocol> manager in managers) {
        if (![(id)manager respondsToSelector:@selector(updateConfiguration:)]) continue;
        [manager updateConfiguration:^(SCValdiConfiguration *config) {
            NSMutableArray *loaders = [NSMutableArray arrayWithArray:config.imageLoaders ?: @[]];
            for (id existing in loaders) {
                if ([existing isKindOfClass:[AtollaIOSImageLoader class]]) return;
            }
            [loaders addObject:loader];
            config.imageLoaders = loaders;
        }];
    }
}

- (double)getAtollaImageLoaderCacheEntryCount {
    return AtollaIOSImageLoader.sharedInstance.entryCount;
}

- (double)getAtollaImageLoaderCacheByteSize {
    return AtollaIOSImageLoader.sharedInstance.totalBytes;
}

- (double)getAtollaImageLoaderDiskCacheEntryCount {
    return AtollaIOSImageLoader.sharedInstance.diskEntryCount;
}

- (double)getAtollaImageLoaderDiskCacheByteSize {
    return AtollaIOSImageLoader.sharedInstance.diskBytes;
}

- (void)setAtollaImageLoaderDiskCacheMaxBytesWithBytes:(double)bytes {
    [AtollaIOSImageLoader.sharedInstance setDiskCacheMaxBytes:(NSInteger)bytes];
}

- (void)clearAtollaNativeCacheCategoriesWithCategories:(NSArray<NSString *> *)categories {
    [AtollaIOSImageLoader.sharedInstance clearCategories:categories];
}

- (NSString *)extractAtollaPaletteFromCacheWithIdentity:(NSString *)identity category:(NSString *)category {
    return [AtollaIOSImageLoader.sharedInstance extractPaletteForCategory:category identity:identity] ?: @"";
}

- (NSString *)resolveAtollaCachedImageWithCategory:(NSString *)category identity:(NSString *)identity {
    return [AtollaIOSImageLoader.sharedInstance resolveCachedFileUrlForCategory:category
                                                                       identity:identity] ?: @"";
}

- (void)preloadAtollaImagesWithSources:(NSArray<NSString *> *)sources {
    for (NSString *source in sources) {
        [AtollaIOSImageLoader.sharedInstance preloadSource:source];
    }
}

- (NSString *)getAtollaImageLoaderDiskCacheCategoryCountsJson {
    return [AtollaIOSImageLoader.sharedInstance diskCategoryCountsJson];
}

- (void)requestAtollaImageLoaderDiskCacheStatsWithCallback:(atolla_appImageLoaderBootstrapModuleRequestAtollaImageLoaderDiskCacheStatsCallbackBlock)callback {
    [AtollaIOSImageLoader.sharedInstance diskStatsSnapshotWithCompletion:^(NSInteger count, long long bytes, NSString *categoryCountsJson) {
        callback((double)count, (double)bytes, categoryCountsJson);
    }];
}

- (void)setAtollaImageCachedObserverWithCallback:(atolla_appImageLoaderBootstrapModuleSetAtollaImageCachedObserverCallbackBlock)callback {
    [AtollaIOSImageLoader.sharedInstance setImageCachedObserver:callback];
}

- (void)setAtollaImageLoaderAuthTokenWithToken:(NSString *)token {
    AtollaIOSImageLoader.sharedInstance.authToken = token.length > 0 ? token : nil;
}

@end

// MARK: - Module Factory

@interface AtollaImageLoaderBootstrapModuleFactoryImpl : atolla_appImageLoaderBootstrapModuleFactory
@end

@implementation AtollaImageLoaderBootstrapModuleFactoryImpl

VALDI_REGISTER_MODULE()

- (id<atolla_appImageLoaderBootstrapModule>)onLoadModule {
    return [[AtollaImageLoaderBootstrapModuleImpl alloc] init];
}

@end
