#import <atollaTypes/atollaTypes.h>
#import <valdi_core/SCValdiModuleFactoryRegistry.h>
#import <valdi_core/SCValdiImageLoader.h>
#import <valdi_core/SCValdiCancelable.h>
#import <valdi_core/SCValdiConfiguration.h>
#import <valdi_core/SCValdiRuntimeManagerProtocol.h>
#import <Foundation/Foundation.h>
#import <CommonCrypto/CommonDigest.h>
#import <UIKit/UIKit.h>
#import "atolla/native/ios/palette_ios_bridge.h"
#import "atolla/native/ios/blur_ios_bridge.h"

// MARK: - Request Payload

@interface AtollaIOSImageRequestPayload : NSObject
@property (nonatomic, copy) NSString *category;
@property (nonatomic, strong) NSURL *sourceURL;
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
static NSTimeInterval const kImageDiskCacheTTL = 30 * 24 * 3600;

@interface AtollaIOSImageCacheStore : NSObject
- (nullable NSData *)readForKey:(NSString *)key;
- (void)writeData:(NSData *)data forKey:(NSString *)key;
- (void)clearCategories:(NSArray<NSString *> *)categories;
- (void)setDiskCacheMaxBytes:(NSInteger)bytes;
- (NSInteger)entryCount;
- (long long)totalBytes;
- (NSInteger)diskEntryCount;
- (long long)diskBytes;
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
    [_mem removeAllObjects];
    dispatch_sync(_diskQ, ^{
        if (!self->_diskDir) return;
        NSArray<NSURL *> *files = [NSFileManager.defaultManager
            contentsOfDirectoryAtURL:self->_diskDir
            includingPropertiesForKeys:nil options:0 error:nil];
        for (NSURL *file in files) {
            NSString *name = file.lastPathComponent;
            for (NSString *cat in categories) {
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

- (NSURL *)diskFileForKey:(NSString *)key {
    if (!_diskDir) return nil;
    NSString *cat = [key componentsSeparatedByString:@":"].firstObject ?: @"unknown";
    return [_diskDir URLByAppendingPathComponent:
            [NSString stringWithFormat:@"%@_%@", cat, [self sha256:key]]];
}

- (void)evictIfNeeded {
    if (!_diskDir) return;
    NSArray<NSURL *> *files = [NSFileManager.defaultManager
        contentsOfDirectoryAtURL:_diskDir
        includingPropertiesForKeys:@[NSURLFileSizeKey, NSURLContentModificationDateKey]
        options:0 error:nil];
    NSDate *now = NSDate.date;
    NSMutableArray *live = [NSMutableArray array];
    long long total = 0;
    for (NSURL *f in files) {
        NSDate *mod; NSNumber *sz;
        [f getResourceValue:&mod forKey:NSURLContentModificationDateKey error:nil];
        [f getResourceValue:&sz forKey:NSURLFileSizeKey error:nil];
        if (!mod || !sz) continue;
        if ([now timeIntervalSinceDate:mod] > kImageDiskCacheTTL) {
            [NSFileManager.defaultManager removeItemAtURL:f error:nil];
        } else {
            [live addObject:@{@"u": f, @"s": sz, @"m": mod}];
            total += sz.longLongValue;
        }
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
+ (instancetype)sharedInstance;
- (nullable NSString *)extractPaletteForCategory:(NSString *)category sourceURL:(NSString *)url;
- (void)preloadURL:(NSString *)url category:(NSString *)category;
- (void)clearCategories:(NSArray<NSString *> *)categories;
- (void)setDiskCacheMaxBytes:(NSInteger)bytes;
- (void)setImageCachedObserver:(void (^)(NSString *url, NSString *category))observer;
- (NSInteger)entryCount;
- (long long)totalBytes;
- (NSInteger)diskEntryCount;
- (long long)diskBytes;
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
    if (self) { _cache = [[AtollaIOSImageCacheStore alloc] init]; }
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
    NSString *category = nil, *sourceURLString = nil;
    for (NSURLQueryItem *item in c.queryItems) {
        if ([item.name isEqualToString:@"c"]) category = item.value;
        else if ([item.name isEqualToString:@"u"]) sourceURLString = item.value;
    }
    NSURL *sourceURL = sourceURLString ? [NSURL URLWithString:sourceURLString] : nil;
    if (!category || !sourceURL) {
        if (error) *error = [NSError errorWithDomain:@"AtollaIOSImageLoader" code:2
                                            userInfo:@{NSLocalizedDescriptionKey: @"Missing c or u params"}];
        return nil;
    }
    AtollaIOSImageRequestPayload *payload = [[AtollaIOSImageRequestPayload alloc] init];
    payload.category = category;
    payload.sourceURL = sourceURL;
    return payload;
}

- (id<SCValdiCancelable>)loadBytesWithRequestPayload:(AtollaIOSImageRequestPayload *)payload
                                          completion:(SCValdiImageLoaderBytesCompletion)completion {
    NSString *key = [NSString stringWithFormat:@"%@:%@", payload.category, payload.sourceURL.absoluteString];
    NSData *cached = [_cache readForKey:key];
    if (cached) {
        completion(cached, nil);
        return [[AtollaNoopCancelable alloc] init];
    }

    if ([payload.category isEqualToString:@"album_art_blurred"]) {
        NSString *originalKey = [NSString stringWithFormat:@"album_art:%@", payload.sourceURL.absoluteString];
        NSData *originalData = [_cache readForKey:originalKey];
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
        NSURLSessionDataTask *task = [NSURLSession.sharedSession
            dataTaskWithURL:payload.sourceURL
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

    NSURLSessionDataTask *task = [NSURLSession.sharedSession
        dataTaskWithURL:payload.sourceURL
        completionHandler:^(NSData *data, NSURLResponse *response, NSError *err) {
            if (!data) { completion(nil, err); return; }
            [self->_cache writeData:data forKey:key];
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

- (nullable NSString *)extractPaletteForCategory:(NSString *)category sourceURL:(NSString *)url {
    NSString *key = [NSString stringWithFormat:@"%@:%@", category, url];
    NSData *data = [_cache readForKey:key];
    if (!data) return nil;
    return [AtollaPaletteExtractor extractPaletteFromData:data];
}

- (void)preloadURL:(NSString *)url category:(NSString *)category {
    NSURL *sourceURL = [NSURL URLWithString:url];
    if (!sourceURL) return;
    NSString *key = [NSString stringWithFormat:@"%@:%@", category, url];
    if ([_cache readForKey:key]) return;
    NSURLSessionDataTask *task = [NSURLSession.sharedSession
        dataTaskWithURL:sourceURL
        completionHandler:^(NSData *data, NSURLResponse *r, NSError *e) {
            if (!data) return;
            [self->_cache writeData:data forKey:key];
            if (self->_imageCachedObserver) self->_imageCachedObserver(url, category);
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

@end

// MARK: - Bootstrap Module

@interface AtollaImageLoaderBootstrapModuleImpl : NSObject <atollaImageLoaderBootstrapModule>
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

- (NSString *)extractAtollaPaletteFromCacheWithUrl:(NSString *)url category:(NSString *)category {
    return [AtollaIOSImageLoader.sharedInstance extractPaletteForCategory:category sourceURL:url] ?: @"";
}

- (void)preloadAtollaImagesWithUrls:(NSArray<NSString *> *)urls category:(NSString *)category {
    for (NSString *url in urls) {
        [AtollaIOSImageLoader.sharedInstance preloadURL:url category:category];
    }
}

- (void)setAtollaImageCachedObserverWithCallback:(atollaImageLoaderBootstrapModuleSetAtollaImageCachedObserverCallbackBlock)callback {
    [AtollaIOSImageLoader.sharedInstance setImageCachedObserver:callback];
}

@end

// MARK: - Module Factory

@interface AtollaImageLoaderBootstrapModuleFactoryImpl : atollaImageLoaderBootstrapModuleFactory
@end

@implementation AtollaImageLoaderBootstrapModuleFactoryImpl

VALDI_REGISTER_MODULE()

- (id<atollaImageLoaderBootstrapModule>)onLoadModule {
    return [[AtollaImageLoaderBootstrapModuleImpl alloc] init];
}

@end
