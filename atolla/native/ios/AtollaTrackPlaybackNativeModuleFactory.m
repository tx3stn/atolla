#import <atollaTypes/atollaTypes.h>
#import <valdi_core/SCValdiModuleFactoryRegistry.h>
#import <AVFoundation/AVFoundation.h>
#import <MediaPlayer/MediaPlayer.h>
#import <Foundation/Foundation.h>
#import <objc/runtime.h>
#import "atolla/native/ios/AtollaPlaybackGuards.h"
#import "atolla/native/ios/AtollaAuthRedirectGuard.h"

// associates the source track id with each AVPlayerItem so the loaded current item can be
// identified by track rather than by its (mutable) source URL, mirroring MediaItem.mediaId on
// Android. the id travels with the item through every gapless advance
static const void *kAtollaPlayerItemTrackIdKey = &kAtollaPlayerItemTrackIdKey;
// MARK: - Track File Cache

@interface AtollaTrackCache : NSObject

+ (NSString * _Nonnull)cacheTrackFromUrl:(NSString * _Nonnull)trackId url:(NSString * _Nonnull)url authToken:(NSString * _Nonnull)authToken;
+ (NSString * _Nonnull)getCachedTrackFileUrl:(NSString * _Nonnull)trackId;
+ (NSInteger)getCacheEntryCount;
+ (void)clearCache;
+ (void)setCacheMaxTracks:(NSInteger)maxTracks;

@end

@implementation AtollaTrackCache {
}

static NSInteger sTrackCacheMaxTracks = 20;
static NSString * const kTrackCacheFolder = @"atolla-track-cache";
static NSLock *sTrackCacheLock;
static NSMutableSet<NSString *> *sInProgressKeys;

+ (void)initialize {
    if (self == [AtollaTrackCache class]) {
        sTrackCacheLock = [[NSLock alloc] init];
        sInProgressKeys = [NSMutableSet set];
    }
}

+ (nullable NSURL *)resolveCacheDir {
    NSURL *cacheDir = [[[NSFileManager defaultManager] URLsForDirectory:NSCachesDirectory
                                                              inDomains:NSUserDomainMask] firstObject];
    if (!cacheDir) return nil;
    NSURL *dir = [cacheDir URLByAppendingPathComponent:kTrackCacheFolder isDirectory:YES];
    NSError *error = nil;
    [[NSFileManager defaultManager] createDirectoryAtURL:dir
                               withIntermediateDirectories:YES
                                                attributes:nil
                                                     error:&error];
    return error ? nil : dir;
}

+ (NSString * _Nonnull)safeTrackKey:(NSString * _Nonnull)trackId {
    NSString *trimmed = [trackId stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceCharacterSet]];
    if (trimmed.length == 0) return @"track";
    NSMutableString *result = [NSMutableString stringWithCapacity:trimmed.length];
    for (NSUInteger i = 0; i < trimmed.length; i++) {
        unichar c = [trimmed characterAtIndex:i];
        if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') ||
            c == '.' || c == '_' || c == '-') {
            [result appendFormat:@"%C", c];
        } else {
            [result appendString:@"_"];
        }
    }
    return result;
}

+ (NSString * _Nonnull)extensionFromMimeType:(NSString * _Nonnull)mimeType {
    NSString *lower = [mimeType lowercaseString];
    if ([lower containsString:@"aac"]) return @"aac";
    if ([lower containsString:@"flac"]) return @"flac";
    if ([lower containsString:@"ogg"]) return @"ogg";
    if ([lower containsString:@"wav"]) return @"wav";
    if ([lower containsString:@"m4a"] || [lower containsString:@"mp4"]) return @"m4a";
    return @"mp3";
}

+ (BOOL)isLikelyAudioMimeType:(NSString * _Nonnull)mimeType {
    NSString *lower = [mimeType lowercaseString];
    return [lower hasPrefix:@"audio/"] || [lower containsString:@"octet-stream"];
}

// downloads url directly to a temp file on disk (no in-memory buffering). returns the temp
// file URL and populates outMimeType on success, nil on failure. caller deletes the temp file
+ (nullable NSURL *)streamDownloadFromURL:(NSURL *)sourceURL
                               authToken:(NSString * _Nullable)authToken
                                 mimeType:(NSString * _Nullable * _Nonnull)outMimeType {
    NSURLSessionConfiguration *config = [NSURLSessionConfiguration ephemeralSessionConfiguration];
    config.timeoutIntervalForRequest = 30.0;
    config.timeoutIntervalForResource = 300.0;
    NSURLSession *session = [NSURLSession sessionWithConfiguration:config
                                                          delegate:[[AtollaAuthRedirectGuard alloc] init]
                                                     delegateQueue:nil];

    NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:sourceURL
                                                           cachePolicy:NSURLRequestReloadIgnoringLocalCacheData
                                                       timeoutInterval:30.0];
    [request setValue:@"audio/*,*/*" forHTTPHeaderField:@"Accept"];
    if (authToken.length > 0) {
        [request setValue:authToken forHTTPHeaderField:@"X-Emby-Token"];
        [request setValue:[NSString stringWithFormat:@"MediaBrowser Token=\"%@\"", authToken]
       forHTTPHeaderField:@"Authorization"];
    }

    dispatch_semaphore_t sem = dispatch_semaphore_create(0);
    __block NSURL *tmpResult = nil;
    __block NSString *mimeResult = nil;

    NSURLSessionDownloadTask *task = [session downloadTaskWithRequest:request
        completionHandler:^(NSURL *location, NSURLResponse *resp, NSError *error) {
            NSHTTPURLResponse *httpResp = (NSHTTPURLResponse *)resp;
            if (!error && location &&
                httpResp.statusCode >= 200 && httpResp.statusCode < 300) {
                mimeResult = [httpResp MIMEType] ?: @"application/octet-stream";
                // location is deleted after this block, so move it somewhere persistent
                NSURL *persistentTmp = [[NSURL fileURLWithPath:NSTemporaryDirectory()]
                    URLByAppendingPathComponent:[[NSUUID UUID] UUIDString]];
                NSError *moveErr = nil;
                [[NSFileManager defaultManager] moveItemAtURL:location toURL:persistentTmp error:&moveErr];
                if (!moveErr) tmpResult = persistentTmp;
            }
            dispatch_semaphore_signal(sem);
        }];
    [task resume];
    dispatch_semaphore_wait(sem, dispatch_time(DISPATCH_TIME_NOW, 300 * NSEC_PER_SEC));
    [session finishTasksAndInvalidate];

    *outMimeType = mimeResult;
    return tmpResult;
}

+ (nullable NSURL *)resolveExistingTrackFileWithKey:(NSString *)key inDir:(NSURL *)dir {
    NSArray<NSURL *> *files = [[NSFileManager defaultManager]
        contentsOfDirectoryAtURL:dir
      includingPropertiesForKeys:nil
                         options:0
                           error:nil];
    for (NSURL *file in files) {
        if ([[file lastPathComponent] hasPrefix:[key stringByAppendingString:@"."]]) {
            return file;
        }
    }
    return nil;
}

+ (void)deleteExistingTrackFilesForKey:(NSString *)key inDir:(NSURL *)dir {
    NSArray<NSURL *> *files = [[NSFileManager defaultManager]
        contentsOfDirectoryAtURL:dir
      includingPropertiesForKeys:nil
                         options:0
                           error:nil];
    for (NSURL *file in files) {
        if ([[file lastPathComponent] hasPrefix:[key stringByAppendingString:@"."]]) {
            [[NSFileManager defaultManager] removeItemAtURL:file error:nil];
        }
    }
}

+ (void)touchFile:(NSURL *)file {
    [[NSFileManager defaultManager] setAttributes:@{NSFileModificationDate: [NSDate date]}
                                     ofItemAtPath:file.path
                                            error:nil];
}

+ (void)pruneIfNeededInDir:(NSURL *)dir {
    NSInteger maxTracks = sTrackCacheMaxTracks;
    if (maxTracks <= 0) return;

    NSArray<NSURL *> *files = [[NSFileManager defaultManager]
        contentsOfDirectoryAtURL:dir
      includingPropertiesForKeys:@[NSURLContentModificationDateKey]
                         options:0
                           error:nil];

    NSMutableArray<NSURL *> *trackFiles = [NSMutableArray array];
    for (NSURL *file in files) {
        NSNumber *isDir = nil;
        [file getResourceValue:&isDir forKey:NSURLIsDirectoryKey error:nil];
        if (![isDir boolValue]) [trackFiles addObject:file];
    }

    if ((NSInteger)trackFiles.count <= maxTracks) return;

    [trackFiles sortUsingComparator:^NSComparisonResult(NSURL *a, NSURL *b) {
        NSDate *dateA = nil, *dateB = nil;
        [a getResourceValue:&dateA forKey:NSURLContentModificationDateKey error:nil];
        [b getResourceValue:&dateB forKey:NSURLContentModificationDateKey error:nil];
        if (!dateA) return NSOrderedAscending;
        if (!dateB) return NSOrderedDescending;
        return [dateA compare:dateB];
    }];

    NSInteger toDelete = trackFiles.count - maxTracks;
    for (NSInteger i = 0; i < toDelete; i++) {
        [[NSFileManager defaultManager] removeItemAtURL:trackFiles[i] error:nil];
    }
}

+ (NSString * _Nonnull)cacheTrackFromUrl:(NSString * _Nonnull)trackId url:(NSString * _Nonnull)url authToken:(NSString * _Nonnull)authToken {
    if (trackId.length == 0 || url.length == 0) return @"";

    // only HTTP(S) sources are downloadable here; a local file:// (already-cached/offline) url
    // is already available and must not be routed through the network download path
    if (![url hasPrefix:@"http://"] && ![url hasPrefix:@"https://"]) return @"";

    NSURL *dir = [self resolveCacheDir];
    if (!dir) return @"";
    NSString *key = [self safeTrackKey:trackId];

    // fast path: check cache and register in-progress (brief lock)
    [sTrackCacheLock lock];
    NSURL *existing = [self resolveExistingTrackFileWithKey:key inDir:dir];
    if (existing && [[NSFileManager defaultManager] fileExistsAtPath:existing.path]) {
        [self touchFile:existing];
        NSString *result = [@"file://" stringByAppendingString:existing.path];
        [sTrackCacheLock unlock];
        return result;
    }
    if ([sInProgressKeys containsObject:key]) {
        [sTrackCacheLock unlock];
        return @"";
    }
    [sInProgressKeys addObject:key];
    [sTrackCacheLock unlock];

    // download without holding the lock so getCachedTrackFileUrl isn't blocked during slow
    // network I/O. streams directly to disk, no in-memory buffering
    NSURL *sourceURL = [NSURL URLWithString:url];
    if (!sourceURL) {
        [sTrackCacheLock lock];
        [sInProgressKeys removeObject:key];
        [sTrackCacheLock unlock];
        return @"";
    }

    NSString *mimeType = nil;
    NSURL *downloadedTmp = [self streamDownloadFromURL:sourceURL authToken:authToken mimeType:&mimeType];

    NSString *result = @"";
    if (downloadedTmp && mimeType && [self isLikelyAudioMimeType:mimeType]) {
        NSString *ext = [self extensionFromMimeType:mimeType];
        // brief lock to finalize: delete stale files, rename temp, prune
        [sTrackCacheLock lock];
        NSURL *file = [dir URLByAppendingPathComponent:[NSString stringWithFormat:@"%@.%@", key, ext]];
        [self deleteExistingTrackFilesForKey:key inDir:dir];
        NSError *moveError = nil;
        [[NSFileManager defaultManager] moveItemAtURL:downloadedTmp toURL:file error:&moveError];
        if (moveError) {
            [[NSFileManager defaultManager] removeItemAtURL:downloadedTmp error:nil];
        } else {
            [self touchFile:file];
            [self pruneIfNeededInDir:dir];
            result = [@"file://" stringByAppendingString:file.path];
        }
        [sInProgressKeys removeObject:key];
        [sTrackCacheLock unlock];
        return result;
    }

    if (downloadedTmp) {
        [[NSFileManager defaultManager] removeItemAtURL:downloadedTmp error:nil];
    }
    [sTrackCacheLock lock];
    [sInProgressKeys removeObject:key];
    [sTrackCacheLock unlock];
    return result;
}

+ (NSString * _Nonnull)getCachedTrackFileUrl:(NSString * _Nonnull)trackId {
    if (trackId.length == 0) return @"";
    [sTrackCacheLock lock];
    @try {
        NSURL *dir = [self resolveCacheDir];
        if (!dir) return @"";
        NSString *key = [self safeTrackKey:trackId];
        NSURL *file = [self resolveExistingTrackFileWithKey:key inDir:dir];
        if (!file || ![[NSFileManager defaultManager] fileExistsAtPath:file.path]) return @"";
        [self touchFile:file];
        return [@"file://" stringByAppendingString:file.path];
    } @finally {
        [sTrackCacheLock unlock];
    }
}

+ (NSInteger)getCacheEntryCount {
    [sTrackCacheLock lock];
    @try {
        NSURL *dir = [self resolveCacheDir];
        if (!dir) return 0;
        NSArray *files = [[NSFileManager defaultManager] contentsOfDirectoryAtURL:dir
                                                       includingPropertiesForKeys:nil
                                                                          options:0
                                                                            error:nil];
        return files.count;
    } @finally {
        [sTrackCacheLock unlock];
    }
}

+ (void)clearCache {
    [sTrackCacheLock lock];
    @try {
        NSURL *dir = [self resolveCacheDir];
        if (!dir) return;
        NSArray<NSURL *> *files = [[NSFileManager defaultManager]
            contentsOfDirectoryAtURL:dir includingPropertiesForKeys:nil options:0 error:nil];
        for (NSURL *file in files) {
            [[NSFileManager defaultManager] removeItemAtURL:file error:nil];
        }
    } @finally {
        [sTrackCacheLock unlock];
    }
}

+ (void)setCacheMaxTracks:(NSInteger)maxTracks {
    if (maxTracks <= 0) return;
    [sTrackCacheLock lock];
    @try {
        sTrackCacheMaxTracks = maxTracks;
        NSURL *dir = [self resolveCacheDir];
        if (dir) [self pruneIfNeededInDir:dir];
    } @finally {
        [sTrackCacheLock unlock];
    }
}

@end


// MARK: - Downloaded Track Cache

@interface AtollaDownloadedTrackCache : NSObject

+ (NSString * _Nonnull)cacheTrackFromUrl:(NSString * _Nonnull)trackId url:(NSString * _Nonnull)url authToken:(NSString * _Nonnull)authToken;
+ (NSString * _Nonnull)getCachedTrackFileUrl:(NSString * _Nonnull)trackId;
+ (long long)getTotalSizeBytes;
+ (void)removeTrack:(NSString * _Nonnull)trackId;

@end

@implementation AtollaDownloadedTrackCache

static NSString * const kDownloadedTrackCacheFolder = @"atolla-downloaded-track-cache";
static NSLock *sDownloadedTrackCacheLock;
static NSMutableSet<NSString *> *sInProgressDownloadedKeys;

+ (void)initialize {
    if (self == [AtollaDownloadedTrackCache class]) {
        sDownloadedTrackCacheLock = [[NSLock alloc] init];
        sInProgressDownloadedKeys = [NSMutableSet set];
    }
}

+ (nullable NSURL *)resolveFilesDir {
    NSURL *docs = [[[NSFileManager defaultManager] URLsForDirectory:NSDocumentDirectory
                                                          inDomains:NSUserDomainMask] firstObject];
    if (!docs) return nil;
    NSURL *dir = [docs URLByAppendingPathComponent:kDownloadedTrackCacheFolder isDirectory:YES];
    NSError *error = nil;
    [[NSFileManager defaultManager] createDirectoryAtURL:dir
                               withIntermediateDirectories:YES
                                                attributes:nil
                                                     error:&error];
    return error ? nil : dir;
}

+ (NSString * _Nonnull)safeKey:(NSString * _Nonnull)trackId {
    return [AtollaTrackCache safeTrackKey:trackId];
}

+ (nullable NSURL *)resolveExistingFileForKey:(NSString *)key inDir:(NSURL *)dir {
    return [AtollaTrackCache resolveExistingTrackFileWithKey:key inDir:dir];
}

+ (NSString * _Nonnull)cacheTrackFromUrl:(NSString * _Nonnull)trackId url:(NSString * _Nonnull)url authToken:(NSString * _Nonnull)authToken {
    if (trackId.length == 0 || url.length == 0) return @"";

    NSURL *dir = [self resolveFilesDir];
    if (!dir) return @"";
    NSString *key = [self safeKey:trackId];

    // fast path: check cache and register in-progress (brief lock)
    [sDownloadedTrackCacheLock lock];
    NSURL *existing = [self resolveExistingFileForKey:key inDir:dir];
    if (existing && [[NSFileManager defaultManager] fileExistsAtPath:existing.path]) {
        [AtollaTrackCache touchFile:existing];
        NSString *result = [@"file://" stringByAppendingString:existing.path];
        [sDownloadedTrackCacheLock unlock];
        return result;
    }
    if ([sInProgressDownloadedKeys containsObject:key]) {
        [sDownloadedTrackCacheLock unlock];
        return @"";
    }
    [sInProgressDownloadedKeys addObject:key];
    [sDownloadedTrackCacheLock unlock];

    // download without holding the lock so getCachedTrackFileUrl isn't blocked during slow
    // network I/O. streams directly to disk, no in-memory buffering
    NSURL *sourceURL = [NSURL URLWithString:url];
    if (!sourceURL) {
        [sDownloadedTrackCacheLock lock];
        [sInProgressDownloadedKeys removeObject:key];
        [sDownloadedTrackCacheLock unlock];
        return @"";
    }

    NSString *mimeType = nil;
    NSURL *downloadedTmp = [AtollaTrackCache streamDownloadFromURL:sourceURL authToken:authToken mimeType:&mimeType];

    NSString *result = @"";
    if (downloadedTmp && mimeType && [AtollaTrackCache isLikelyAudioMimeType:mimeType]) {
        NSString *ext = [AtollaTrackCache extensionFromMimeType:mimeType];
        // brief lock to finalize: delete stale files, move temp, touch
        [sDownloadedTrackCacheLock lock];
        NSURL *file = [dir URLByAppendingPathComponent:[NSString stringWithFormat:@"%@.%@", key, ext]];
        [AtollaTrackCache deleteExistingTrackFilesForKey:key inDir:dir];
        NSError *moveError = nil;
        [[NSFileManager defaultManager] moveItemAtURL:downloadedTmp toURL:file error:&moveError];
        if (moveError) {
            [[NSFileManager defaultManager] removeItemAtURL:downloadedTmp error:nil];
        } else {
            [AtollaTrackCache touchFile:file];
            result = [@"file://" stringByAppendingString:file.path];
        }
        [sInProgressDownloadedKeys removeObject:key];
        [sDownloadedTrackCacheLock unlock];
        return result;
    }

    if (downloadedTmp) {
        [[NSFileManager defaultManager] removeItemAtURL:downloadedTmp error:nil];
    }
    [sDownloadedTrackCacheLock lock];
    [sInProgressDownloadedKeys removeObject:key];
    [sDownloadedTrackCacheLock unlock];
    return result;
}

+ (NSString * _Nonnull)getCachedTrackFileUrl:(NSString * _Nonnull)trackId {
    if (trackId.length == 0) return @"";
    [sDownloadedTrackCacheLock lock];
    @try {
        NSURL *dir = [self resolveFilesDir];
        if (!dir) return @"";
        NSString *key = [self safeKey:trackId];
        NSURL *file = [self resolveExistingFileForKey:key inDir:dir];
        if (!file || ![[NSFileManager defaultManager] fileExistsAtPath:file.path]) return @"";
        [AtollaTrackCache touchFile:file];
        return [@"file://" stringByAppendingString:file.path];
    } @finally {
        [sDownloadedTrackCacheLock unlock];
    }
}

+ (long long)getTotalSizeBytes {
    [sDownloadedTrackCacheLock lock];
    @try {
        NSURL *dir = [self resolveFilesDir];
        if (!dir) return 0;
        NSArray<NSURL *> *files = [[NSFileManager defaultManager]
            contentsOfDirectoryAtURL:dir
          includingPropertiesForKeys:@[NSURLFileSizeKey]
                             options:0
                               error:nil];
        long long total = 0;
        for (NSURL *file in files) {
            NSNumber *size = nil;
            [file getResourceValue:&size forKey:NSURLFileSizeKey error:nil];
            total += size.longLongValue;
        }
        return total;
    } @finally {
        [sDownloadedTrackCacheLock unlock];
    }
}

+ (void)removeTrack:(NSString * _Nonnull)trackId {
    if (trackId.length == 0) return;
    [sDownloadedTrackCacheLock lock];
    @try {
        NSURL *dir = [self resolveFilesDir];
        if (!dir) return;
        NSString *key = [self safeKey:trackId];
        [AtollaTrackCache deleteExistingTrackFilesForKey:key inDir:dir];
    } @finally {
        [sDownloadedTrackCacheLock unlock];
    }
}

@end


// MARK: - Media Session

@interface AtollaMediaSession : NSObject
+ (void)updateNowPlayingWithTrackName:(NSString *)trackName
                           artistName:(NSString *)artistName
                            albumName:(NSString *)albumName
                           artworkUrl:(NSString *)artworkUrl
                            isPlaying:(BOOL)isPlaying
                      positionSeconds:(double)positionSeconds
                      durationSeconds:(double)durationSeconds
                          hasPrevious:(BOOL)hasPrevious
                              hasNext:(BOOL)hasNext;
+ (void)clearNowPlaying;
+ (NSString * _Nonnull)consumeAction;
+ (BOOL)ensurePermission;
// current Jellyfin access token, pushed out-of-band on session change; applied as an auth
// header when fetching remote artwork so the token never travels in the artwork URL
+ (void)setAuthToken:(nullable NSString *)token;
+ (nullable NSString *)authToken;
@end

@implementation AtollaMediaSession

static NSMutableArray<NSString *> *sPendingActions;
static NSString *sAuthToken = nil;

+ (void)setAuthToken:(NSString *)token {
    @synchronized (self) {
        sAuthToken = token.length > 0 ? [token copy] : nil;
    }
}

+ (NSString *)authToken {
    @synchronized (self) {
        return sAuthToken;
    }
}
static NSLock *sMediaSessionLock;
static BOOL sCommandsRegistered = NO;

+ (void)initialize {
    if (self == [AtollaMediaSession class]) {
        sMediaSessionLock = [[NSLock alloc] init];
        sPendingActions = [NSMutableArray array];
    }
}

+ (void)ensureCommandCenterRegistered {
    if (sCommandsRegistered) return;
    sCommandsRegistered = YES;

    MPRemoteCommandCenter *cc = [MPRemoteCommandCenter sharedCommandCenter];

    [cc.playCommand addTargetWithHandler:^MPRemoteCommandHandlerStatus(MPRemoteCommandEvent * _Nonnull event) {
        [sMediaSessionLock lock];
        if (sPendingActions.count < 2) [sPendingActions addObject:@"play"];
        [sMediaSessionLock unlock];
        return MPRemoteCommandHandlerStatusSuccess;
    }];

    [cc.pauseCommand addTargetWithHandler:^MPRemoteCommandHandlerStatus(MPRemoteCommandEvent * _Nonnull event) {
        [sMediaSessionLock lock];
        if (sPendingActions.count < 2) [sPendingActions addObject:@"pause"];
        [sMediaSessionLock unlock];
        return MPRemoteCommandHandlerStatusSuccess;
    }];

    // togglePlayPauseCommand fires from headphone/AirPods button, so it must toggle regardless
    // of current state: uses "toggle" rather than "play" (a no-op when already playing)
    [cc.togglePlayPauseCommand addTargetWithHandler:^MPRemoteCommandHandlerStatus(MPRemoteCommandEvent * _Nonnull event) {
        [sMediaSessionLock lock];
        if (sPendingActions.count < 2) [sPendingActions addObject:@"toggle"];
        [sMediaSessionLock unlock];
        return MPRemoteCommandHandlerStatusSuccess;
    }];

    [cc.nextTrackCommand addTargetWithHandler:^MPRemoteCommandHandlerStatus(MPRemoteCommandEvent * _Nonnull event) {
        [sMediaSessionLock lock];
        if (sPendingActions.count < 2) [sPendingActions addObject:@"next"];
        [sMediaSessionLock unlock];
        return MPRemoteCommandHandlerStatusSuccess;
    }];

    [cc.previousTrackCommand addTargetWithHandler:^MPRemoteCommandHandlerStatus(MPRemoteCommandEvent * _Nonnull event) {
        [sMediaSessionLock lock];
        if (sPendingActions.count < 2) [sPendingActions addObject:@"previous"];
        [sMediaSessionLock unlock];
        return MPRemoteCommandHandlerStatusSuccess;
    }];

    [cc.stopCommand addTargetWithHandler:^MPRemoteCommandHandlerStatus(MPRemoteCommandEvent * _Nonnull event) {
        [sMediaSessionLock lock];
        if (sPendingActions.count < 2) [sPendingActions addObject:@"pause"];
        [sMediaSessionLock unlock];
        return MPRemoteCommandHandlerStatusSuccess;
    }];
}

+ (void)updateNowPlayingWithTrackName:(NSString *)trackName
                           artistName:(NSString *)artistName
                            albumName:(NSString *)albumName
                           artworkUrl:(NSString *)artworkUrl
                            isPlaying:(BOOL)isPlaying
                      positionSeconds:(double)positionSeconds
                      durationSeconds:(double)durationSeconds
                          hasPrevious:(BOOL)hasPrevious
                              hasNext:(BOOL)hasNext {
    dispatch_async(dispatch_get_main_queue(), ^{
        [self ensureCommandCenterRegistered];

        MPRemoteCommandCenter *cc = [MPRemoteCommandCenter sharedCommandCenter];
        cc.previousTrackCommand.enabled = hasPrevious;
        cc.nextTrackCommand.enabled = hasNext;

        NSMutableDictionary *info = [NSMutableDictionary dictionary];
        info[MPMediaItemPropertyTitle] = trackName.length ? trackName : @"Track";
        if (artistName.length) info[MPMediaItemPropertyArtist] = artistName;
        if (albumName.length) info[MPMediaItemPropertyAlbumTitle] = albumName;
        if (durationSeconds > 0) info[MPMediaItemPropertyPlaybackDuration] = @(durationSeconds);
        info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = @(positionSeconds);
        info[MPNowPlayingInfoPropertyPlaybackRate] = @(isPlaying ? 1.0 : 0.0);

        [[MPNowPlayingInfoCenter defaultCenter] setNowPlayingInfo:info];

        if (artworkUrl.length) {
            dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_LOW, 0), ^{
                NSURL *url = [NSURL URLWithString:artworkUrl];
                if (!url) return;
                NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:url];
                NSString *token = [AtollaMediaSession authToken];
                if (token.length > 0) {
                    [request setValue:token forHTTPHeaderField:@"X-Emby-Token"];
                    [request setValue:[NSString stringWithFormat:@"MediaBrowser Token=\"%@\"", token]
                   forHTTPHeaderField:@"Authorization"];
                }
                __block NSData *data = nil;
                dispatch_semaphore_t sem = dispatch_semaphore_create(0);
                NSURLSessionDataTask *task = [[AtollaAuthRedirectGuard sharedDefaultSession] dataTaskWithRequest:request
                    completionHandler:^(NSData *d, NSURLResponse *r, NSError *e) {
                        data = d;
                        dispatch_semaphore_signal(sem);
                    }];
                [task resume];
                dispatch_semaphore_wait(sem, dispatch_time(DISPATCH_TIME_NOW, (int64_t)(20 * NSEC_PER_SEC)));
                if (!data) return;
                UIImage *image = [UIImage imageWithData:data];
                if (!image) return;
                dispatch_async(dispatch_get_main_queue(), ^{
                    MPMediaItemArtwork *artwork = [[MPMediaItemArtwork alloc] initWithBoundsSize:image.size
                                                                                  requestHandler:^UIImage *(CGSize size) {
                        return image;
                    }];
                    NSMutableDictionary *updated = [[[MPNowPlayingInfoCenter defaultCenter] nowPlayingInfo] mutableCopy] ?: [NSMutableDictionary dictionary];
                    updated[MPMediaItemPropertyArtwork] = artwork;
                    [[MPNowPlayingInfoCenter defaultCenter] setNowPlayingInfo:updated];
                });
            });
        }
    });
}

+ (void)clearNowPlaying {
    dispatch_async(dispatch_get_main_queue(), ^{
        [[MPNowPlayingInfoCenter defaultCenter] setNowPlayingInfo:nil];
    });
}

+ (NSString * _Nonnull)consumeAction {
    [sMediaSessionLock lock];
    NSString *action = sPendingActions.firstObject ?: @"";
    if (sPendingActions.count > 0) [sPendingActions removeObjectAtIndex:0];
    [sMediaSessionLock unlock];
    return action;
}

+ (BOOL)ensurePermission {
    return YES;
}

@end


// MARK: - Gapless Audio Engine

@interface AtollaGaplessAudioEngine : NSObject

+ (void)configureWithCurrentSourceUrl:(NSString *)currentSourceUrl
                       currentTrackId:(NSString *)currentTrackId
                     currentDurationMs:(double)currentDurationMs
                       nextSourceUrl:(NSString *)nextSourceUrl
                           nextTrackId:(NSString *)nextTrackId
                         nextDurationMs:(double)nextDurationMs
                   allowBackwardRebuild:(BOOL)allowBackwardRebuild;
+ (void)setPlaybackRate:(float)rate;
+ (void)setVolume:(float)volume;
+ (void)seekToMs:(long)positionMs;
+ (long)getPositionMs;
+ (long)getDurationMs;
+ (BOOL)isActive;
+ (NSString * _Nonnull)currentTrackId;
+ (NSString * _Nonnull)consumeEvent;
+ (void)clear;
+ (void)setNextNotificationTrackName:(NSString *)trackName
                          artistName:(NSString *)artistName
                           albumName:(NSString *)albumName
                          artworkUrl:(NSString *)artworkUrl
                     durationSeconds:(double)durationSeconds
                         hasPrevious:(BOOL)hasPrevious
                             hasNext:(BOOL)hasNext;
+ (void)setUpcomingQueue:(NSString *)queueJson;

@end

@implementation AtollaGaplessAudioEngine

static AVQueuePlayer *sPlayer = nil;
// tokens for the block-based NSNotificationCenter observers registered in
// registerPlayerObservers. they must be removed explicitly in clear; removeObserver: on the
// player removes nothing, since the player isn't the observer for block registrations
static NSMutableArray<id<NSObject>> *sPlayerObserverTokens = nil;
static NSString *sCurrentSourceUrl = @"";
static NSString *sCurrentTrackId = @"";
static NSString *sNextSourceUrl = @"";
static NSString *sNextTrackId = @"";
static float sPlaybackRate = 0.0f;
static float sVolume = 1.0f;
static long sPendingSeekMs = -1;
static NSMutableArray<NSString *> *sEventQueue;
static NSLock *sEngineLock;

static NSString *sNextNotificationTrackName = @"";
static NSString *sNextNotificationArtistName = @"";
static NSString *sNextNotificationAlbumName = @"";
static NSString *sNextNotificationArtworkUrl = @"";
static double sNextNotificationDurationSeconds = 0;
static BOOL sNextNotificationHasPrevious = NO;
static BOOL sNextNotificationHasNext = NO;

// ordered window of the play queue around the current track ([history..., current,
// upcoming...]; dictionaries from setUpcomingQueue's JSON). lets the engine keep topping the
// AVQueuePlayer up at each item boundary so background playback survives multiple track
// transitions while the JS runtime is frozen. AVQueuePlayer is forward-only, so unlike
// Android the history entries are informational (anchor/notification), no native previous.
// replaced as a whole under sEngineLock so readers always see a consistent snapshot.
// sWindowAnchorHint is the engine's running cursor for the current track's window position
static NSArray<NSDictionary *> *sQueueWindow = nil;
static NSInteger sWindowAnchorHint = 0;
static const NSInteger kAtollaLookaheadTargetAhead = 2;

// while a freshly-started remote track fills its initial network buffer, hold back the
// gapless next item / lookahead top-up so they don't compete for bandwidth and stutter the
// start of playback. cleared, and the lookahead attached, once the current item is ready to
// play (see AtollaShouldDeferLookaheadForSource and clearLookaheadSuppressionIfReady in
// registerPlayerObservers). mirrors suppressLookahead on Android. main thread only
static BOOL sSuppressLookahead = NO;
// periodic time observer that reliably clears sSuppressLookahead once the held-back current
// item is actually playing; AVPlayerItemNewAccessLogEntryNotification is not guaranteed to
// fire for progressive (non-HLS) streams. main thread only
static id sLookaheadClearObserver = nil;

+ (void)initialize {
    if (self == [AtollaGaplessAudioEngine class]) {
        sEventQueue = [NSMutableArray array];
        sPlayerObserverTokens = [NSMutableArray array];
        sEngineLock = [[NSLock alloc] init];
        sQueueWindow = @[];
    }
}

+ (void)enqueueEvent:(NSString *)event {
    [sEngineLock lock];
    // sized for long backgrounded sessions where every transition queues a completed event
    // that JS only drains on wake
    if (sEventQueue.count >= 128) [sEventQueue removeObjectAtIndex:0];
    [sEventQueue addObject:event];
    [sEngineLock unlock];
}

+ (NSString *)urlStringForItem:(AVPlayerItem *)item {
    AVAsset *asset = item.asset;
    if (![asset isKindOfClass:[AVURLAsset class]]) return @"";
    return ((AVURLAsset *)asset).URL.absoluteString ?: @"";
}

// the window's URL list plus the anchor (current item's window index), resolved under the
// lock. returns NO when the window is empty or the current URL can't be located
+ (BOOL)snapshotWindow:(NSArray<NSDictionary *> **)outWindow
                  urls:(NSArray<NSString *> **)outUrls
                anchor:(NSInteger *)outAnchor {
    [sEngineLock lock];
    NSArray<NSDictionary *> *window = sQueueWindow;
    NSInteger hint = sWindowAnchorHint;
    NSString *currentUrl = sCurrentSourceUrl;
    [sEngineLock unlock];
    if (window.count == 0) return NO;

    NSMutableArray<NSString *> *urls = [NSMutableArray arrayWithCapacity:window.count];
    for (NSDictionary *entry in window) {
        [urls addObject:([entry[@"sourceUrl"] isKindOfClass:[NSString class]] ? entry[@"sourceUrl"] : @"")];
    }

    NSInteger anchor = AtollaResolveWindowAnchor(urls, hint, currentUrl);
    if (anchor < 0) return NO;

    [sEngineLock lock];
    sWindowAnchorHint = anchor;
    [sEngineLock unlock];

    *outWindow = window;
    *outUrls = urls;
    *outAnchor = anchor;
    return YES;
}

// aligns the AVQueuePlayer with the window after the current item: drops queued items that
// diverge from the window order, then tops up to kAtollaLookaheadTargetAhead items ahead.
// AVQueuePlayer is forward-only so the window's history entries are never queued.
// main thread only
+ (void)ensureWindow {
    if (!sPlayer) return;
    NSArray<NSDictionary *> *window = nil;
    NSArray<NSString *> *urls = nil;
    NSInteger anchor = 0;
    if (![self snapshotWindow:&window urls:&urls anchor:&anchor]) return;

    NSArray<AVPlayerItem *> *items = sPlayer.items;
    for (NSUInteger index = 1; index < items.count; index++) {
        NSString *expectedUrl = (anchor + (NSInteger)index < (NSInteger)urls.count) ? urls[anchor + index] : nil;
        NSString *queuedUrl = [self urlStringForItem:items[index]];
        if (!expectedUrl || ![expectedUrl isEqualToString:queuedUrl]) {
            for (NSUInteger removeIndex = index; removeIndex < items.count; removeIndex++) {
                [sPlayer removeItem:items[removeIndex]];
            }
            break;
        }
    }

    // held back while the current remote track fills its initial buffer; the access-log
    // observer re-runs ensureWindow once it is ready. mirrors syncQueue's guard on Android
    while (!sSuppressLookahead && (NSInteger)sPlayer.items.count - 1 < kAtollaLookaheadTargetAhead) {
        NSArray<AVPlayerItem *> *currentItems = sPlayer.items;
        if (currentItems.count == 0) return;
        NSInteger nextWindowIndex = anchor + (NSInteger)currentItems.count;
        if (nextWindowIndex >= (NSInteger)window.count) return;
        NSString *nextUrl = urls[nextWindowIndex];
        if (nextUrl.length == 0) return;
        NSString *nextWindowTrackId = [window[nextWindowIndex][@"trackId"] isKindOfClass:[NSString class]]
            ? window[nextWindowIndex][@"trackId"] : @"";
        AVPlayerItem *item = [self playerItemForUrl:nextUrl trackId:nextWindowTrackId];
        if (![sPlayer canInsertItem:item afterItem:currentItems.lastObject]) return;
        [sPlayer insertItem:item afterItem:currentItems.lastObject];
    }
}

+ (void)setUpcomingQueue:(NSString *)queueJson {
    NSArray<NSDictionary *> *parsed = @[];
    NSInteger currentIndex = 0;
    if (queueJson.length > 0) {
        NSData *data = [queueJson dataUsingEncoding:NSUTF8StringEncoding];
        id decoded = data ? [NSJSONSerialization JSONObjectWithData:data options:0 error:nil] : nil;
        if ([decoded isKindOfClass:[NSDictionary class]]) {
            NSDictionary *root = (NSDictionary *)decoded;
            id entriesValue = root[@"entries"];
            id currentIndexValue = root[@"currentIndex"];
            if ([currentIndexValue isKindOfClass:[NSNumber class]]) {
                currentIndex = [(NSNumber *)currentIndexValue integerValue];
            }
            if ([entriesValue isKindOfClass:[NSArray class]]) {
                NSMutableArray<NSDictionary *> *entries = [NSMutableArray array];
                BOOL valid = YES;
                for (id candidate in (NSArray *)entriesValue) {
                    // bail on malformed entries rather than skipping them: currentIndex is
                    // positional, so dropping an entry would misalign the whole window
                    if (![candidate isKindOfClass:[NSDictionary class]]) { valid = NO; break; }
                    NSDictionary *entry = (NSDictionary *)candidate;
                    NSString *trackId = [entry[@"trackId"] isKindOfClass:[NSString class]] ? entry[@"trackId"] : @"";
                    if (trackId.length == 0) { valid = NO; break; }
                    [entries addObject:entry];
                }
                if (valid) parsed = entries;
            }
        }
    }

    [sEngineLock lock];
    sQueueWindow = parsed;
    sWindowAnchorHint = currentIndex;
    [sEngineLock unlock];

    dispatch_async(dispatch_get_main_queue(), ^{
        [self ensureWindow];
    });
}

+ (void)configureWithCurrentSourceUrl:(NSString *)currentSourceUrl
                       currentTrackId:(NSString *)currentTrackId
                     currentDurationMs:(double)currentDurationMs
                       nextSourceUrl:(NSString *)nextSourceUrl
                           nextTrackId:(NSString *)nextTrackId
                         nextDurationMs:(double)nextDurationMs
                   allowBackwardRebuild:(BOOL)allowBackwardRebuild {
    [sEngineLock lock];
    sCurrentSourceUrl = currentSourceUrl ?: @"";
    sCurrentTrackId = currentTrackId ?: @"";
    sNextSourceUrl = nextSourceUrl ?: @"";
    sNextTrackId = nextTrackId ?: @"";
    [sEngineLock unlock];

    dispatch_async(dispatch_get_main_queue(), ^{
        if (currentSourceUrl.length == 0) return;

        [self ensureAudioSession];

        if (!sPlayer) {
            sPlayer = [[AVQueuePlayer alloc] init];
            sPlayer.volume = sVolume;
            [self registerPlayerObservers];
        }

        // match on the loaded item's track id (carried as an associated object), falling back to
        // its URL when the id is unknown. matching by id keeps the same track playing when only
        // its source URL changes (stream URL replaced by its cached file, or a re-signed stream
        // query), which would otherwise rebuild the queue and restart from zero. also treat an
        // ended item as a mismatch so it gets re-prepared (the offline gapless transition can
        // leave the player parked at end-of-queue, where [play] alone won't restart it)
        AVPlayerItem *currentItem = sPlayer.currentItem;
        BOOL currentMatches = NO;
        if (currentItem && ![self isItemAtEnd:currentItem]) {
            NSString *currentUrl = [(AVURLAsset *)currentItem.asset URL].absoluteString;
            currentMatches = AtollaCurrentItemMatches([self trackIdForItem:currentItem], currentTrackId,
                                                      currentUrl, currentSourceUrl);
        }

        if (!currentMatches) {
            // belt-and-suspenders: a stale wake-race configure can ask to rebuild back to an
            // earlier track while a later one is still playing. suppress it: keep playing and
            // realign the engine's source to the item actually on screen so currentTrackId and
            // the window anchor stay truthful (otherwise JS would re-reconcile backward)
            NSString *playingUrl = (currentItem && ![self isItemAtEnd:currentItem])
                ? [(AVURLAsset *)currentItem.asset URL].absoluteString : @"";
            if (playingUrl.length > 0) {
                // snapshot the shared window state under the lock: setUpcomingQueue mutates these
                // from the JS bridge thread, so reading them unlocked on the main queue can tear
                // the window/anchor pair or use-after-free the reassigned array
                [sEngineLock lock];
                NSArray<NSDictionary *> *window = sQueueWindow;
                NSInteger anchorHint = sWindowAnchorHint;
                NSString *currentTrackIdSnapshot = sCurrentTrackId;
                [sEngineLock unlock];

                NSMutableArray<NSString *> *urls = [NSMutableArray arrayWithCapacity:window.count];
                for (NSDictionary *entry in window) {
                    [urls addObject:([entry[@"sourceUrl"] isKindOfClass:[NSString class]] ? entry[@"sourceUrl"] : @"")];
                }
                NSInteger currentAnchor = AtollaResolveWindowAnchor(urls, anchorHint, playingUrl);
                NSInteger requestedAnchor = AtollaResolveWindowAnchor(urls, anchorHint, currentSourceUrl);
                if (AtollaShouldSuppressBackwardRebuild(sPlayer.rate > 0, requestedAnchor, currentAnchor, allowBackwardRebuild)) {
                    NSString *playingTrackId =
                        (currentAnchor < (NSInteger)window.count &&
                         [window[currentAnchor][@"trackId"] isKindOfClass:[NSString class]])
                            ? window[currentAnchor][@"trackId"]
                            : currentTrackIdSnapshot;
                    [sEngineLock lock];
                    sCurrentSourceUrl = playingUrl;
                    sCurrentTrackId = playingTrackId;
                    sWindowAnchorHint = currentAnchor;
                    [sEngineLock unlock];
                    [self ensureWindow];
                    if (sPlaybackRate > 0) {
                        [sPlayer play];
                        sPlayer.rate = sPlaybackRate;
                    }
                    return;
                }
            }
            // a streamed current track must fill its initial network buffer alone. adding the
            // gapless next item here makes AVQueuePlayer pre-buffer it in parallel and stutters
            // the start, so hold the lookahead back until the item is ready (see the access-log
            // observer in registerPlayerObservers). mirrors replaceQueue on Android
            sSuppressLookahead = AtollaShouldDeferLookaheadForSource(currentSourceUrl);
            [sPlayer removeAllItems];
            AVPlayerItem *item = [self playerItemForUrl:currentSourceUrl trackId:currentTrackId];
            [sPlayer insertItem:item afterItem:nil];
            if (!sSuppressLookahead && nextSourceUrl.length > 0 && ![nextSourceUrl isEqualToString:currentSourceUrl]) {
                AVPlayerItem *nextItem = [self playerItemForUrl:nextSourceUrl trackId:nextTrackId];
                [sPlayer insertItem:nextItem afterItem:item];
            }
            [self ensureWindow];
            [sPlayer play];
            if (sPlaybackRate > 0) sPlayer.rate = sPlaybackRate;
            [self applyPendingSeekIfNeeded];
        } else {
            // currentMatches implies the item isn't at its end (see the isItemAtEnd guard
            // above), so no end-of-item recovery seek is needed on this fast path
            [self syncQueueWithNext:nextSourceUrl trackId:nextTrackId];
            [self ensureWindow];
            if (sPlaybackRate > 0) {
                [sPlayer play];
                sPlayer.rate = sPlaybackRate;
            }
        }
    });
}

+ (AVPlayerItem *)playerItemForUrl:(NSString *)urlString trackId:(NSString *)trackId {
    NSURL *url = [NSURL URLWithString:urlString];
    AVPlayerItem *item = [AVPlayerItem playerItemWithURL:url];
    objc_setAssociatedObject(item, kAtollaPlayerItemTrackIdKey, trackId ?: @"",
                             OBJC_ASSOCIATION_COPY_NONATOMIC);
    return item;
}

+ (NSString *)trackIdForItem:(AVPlayerItem *)item {
    if (!item) return @"";
    NSString *trackId = objc_getAssociatedObject(item, kAtollaPlayerItemTrackIdKey);
    return trackId ?: @"";
}

// true when the item has effectively played to its end. a play/resume request can't
// restart such an item without a seek, mirroring ExoPlayer's STATE_ENDED behaviour
+ (BOOL)isItemAtEnd:(AVPlayerItem *)item {
    if (!item) return NO;
    CMTime duration = item.duration;
    if (!CMTIME_IS_VALID(duration) || CMTIME_IS_INDEFINITE(duration) || CMTimeGetSeconds(duration) <= 0) {
        return NO;
    }
    CMTime current = item.currentTime;
    if (!CMTIME_IS_VALID(current)) return NO;
    return AtollaIsItemAtEnd(CMTimeGetSeconds(current), CMTimeGetSeconds(duration));
}

// seek the current item back to the start if it has parked at its end, so a subsequent
// [play] actually produces audio instead of silently no-oping
+ (void)seekCurrentItemToStartIfEnded {
    AVPlayerItem *currentItem = sPlayer.currentItem;
    if ([self isItemAtEnd:currentItem]) {
        [sPlayer seekToTime:kCMTimeZero toleranceBefore:kCMTimeZero toleranceAfter:kCMTimeZero];
    }
}

+ (void)syncQueueWithNext:(NSString *)nextSourceUrl trackId:(NSString *)nextTrackId {
    NSArray<AVPlayerItem *> *items = sPlayer.items;
    while (items.count > 1) {
        [sPlayer removeItem:items.lastObject];
        items = sPlayer.items;
    }
    if (!sSuppressLookahead && nextSourceUrl.length > 0 && ![nextSourceUrl isEqualToString:sCurrentSourceUrl]) {
        AVPlayerItem *nextItem = [self playerItemForUrl:nextSourceUrl trackId:nextTrackId];
        [sPlayer insertItem:nextItem afterItem:sPlayer.currentItem];
    }
}

+ (void)ensureAudioSession {
    NSError *error = nil;
    [[AVAudioSession sharedInstance] setCategory:AVAudioSessionCategoryPlayback error:&error];
    [[AVAudioSession sharedInstance] setActive:YES error:&error];
}

+ (void)registerPlayerObservers {
    [sPlayerObserverTokens addObject:[[NSNotificationCenter defaultCenter] addObserverForName:AVPlayerItemDidPlayToEndTimeNotification
                                                      object:nil
                                                       queue:[NSOperationQueue mainQueue]
                                                  usingBlock:^(NSNotification *note) {
        [sEngineLock lock];
        NSString *finishedTrackId = sCurrentTrackId;
        NSString *nextSrc = sNextSourceUrl;
        NSString *nextId = sNextTrackId;
        NSString *notifTrackName = sNextNotificationTrackName;
        NSString *notifArtistName = sNextNotificationArtistName;
        NSString *notifAlbumName = sNextNotificationAlbumName;
        NSString *notifArtworkUrl = sNextNotificationArtworkUrl;
        double notifDuration = sNextNotificationDurationSeconds;
        BOOL notifHasPrevious = sNextNotificationHasPrevious;
        BOOL notifHasNext = sNextNotificationHasNext;
        sNextSourceUrl = @"";
        sNextTrackId = @"";
        sNextNotificationTrackName = @"";
        sNextNotificationArtistName = @"";
        sNextNotificationAlbumName = @"";
        sNextNotificationArtworkUrl = @"";
        sNextNotificationDurationSeconds = 0;
        sNextNotificationHasPrevious = NO;
        sNextNotificationHasNext = NO;
        [sEngineLock unlock];

        // carry the finished trackId so JS can reconcile deterministically after being
        // frozen across several background transitions
        [self enqueueEvent:(finishedTrackId.length > 0
                                ? [@"completed:" stringByAppendingString:finishedTrackId]
                                : @"completed")];

        // prefer the window for the new current track: it survives multiple transitions, unlike
        // the single configure()-supplied next. AVQueuePlayer has already advanced, so
        // currentItem is the item now playing
        NSString *newCurrentUrl = sPlayer.currentItem ? [self urlStringForItem:sPlayer.currentItem] : @"";
        NSDictionary *upcomingEntry = nil;
        [sEngineLock lock];
        NSArray<NSDictionary *> *window = sQueueWindow;
        NSInteger anchorHint = sWindowAnchorHint;
        [sEngineLock unlock];
        if (newCurrentUrl.length > 0 && window.count > 0) {
            NSMutableArray<NSString *> *urls = [NSMutableArray arrayWithCapacity:window.count];
            for (NSDictionary *entry in window) {
                [urls addObject:([entry[@"sourceUrl"] isKindOfClass:[NSString class]] ? entry[@"sourceUrl"] : @"")];
            }
            NSInteger anchor = AtollaResolveWindowAnchor(urls, anchorHint + 1, newCurrentUrl);
            if (anchor >= 0) {
                upcomingEntry = window[anchor];
                [sEngineLock lock];
                sWindowAnchorHint = anchor;
                [sEngineLock unlock];
            }
        }

        [sEngineLock lock];
        if (upcomingEntry) {
            sCurrentSourceUrl = [upcomingEntry[@"sourceUrl"] isKindOfClass:[NSString class]] ? upcomingEntry[@"sourceUrl"] : @"";
            sCurrentTrackId = upcomingEntry[@"trackId"] ?: @"";
        } else {
            sCurrentSourceUrl = nextSrc;
            sCurrentTrackId = nextId;
        }
        sPendingSeekMs = -1;
        [sEngineLock unlock];

        [self ensureWindow];

        if (upcomingEntry) {
            [AtollaMediaSession updateNowPlayingWithTrackName:(upcomingEntry[@"trackName"] ?: @"")
                                                  artistName:(upcomingEntry[@"artistName"] ?: @"")
                                                   albumName:(upcomingEntry[@"albumName"] ?: @"")
                                                  artworkUrl:(upcomingEntry[@"artworkUrl"] ?: @"")
                                                   isPlaying:YES
                                             positionSeconds:0
                                             durationSeconds:[upcomingEntry[@"durationSeconds"] doubleValue]
                                                 hasPrevious:[upcomingEntry[@"hasPrevious"] boolValue]
                                                     hasNext:[upcomingEntry[@"hasNext"] boolValue]];
        } else if (notifTrackName.length > 0) {
            [AtollaMediaSession updateNowPlayingWithTrackName:notifTrackName
                                                  artistName:notifArtistName
                                                   albumName:notifAlbumName
                                                  artworkUrl:notifArtworkUrl
                                                   isPlaying:YES
                                             positionSeconds:0
                                             durationSeconds:notifDuration
                                                 hasPrevious:notifHasPrevious
                                                     hasNext:notifHasNext];
        }
    }]];

    [sPlayerObserverTokens addObject:[[NSNotificationCenter defaultCenter] addObserverForName:AVPlayerItemFailedToPlayToEndTimeNotification
                                                      object:nil
                                                       queue:[NSOperationQueue mainQueue]
                                                  usingBlock:^(NSNotification *note) {
        NSError *err = note.userInfo[AVPlayerItemFailedToPlayToEndTimeErrorKey];
        NSString *msg = err.localizedDescription ?: @"Playback error";
        [self enqueueEvent:[@"error:" stringByAppendingString:msg]];
    }]];

    [sPlayerObserverTokens addObject:[[NSNotificationCenter defaultCenter] addObserverForName:AVPlayerItemNewAccessLogEntryNotification
                                                      object:nil
                                                       queue:[NSOperationQueue mainQueue]
                                                  usingBlock:^(NSNotification *note) {
        if (((AVPlayerItem *)note.object).status == AVPlayerItemStatusReadyToPlay) {
            [self enqueueEvent:@"loaded"];
            [self applyPendingSeekIfNeeded];
            // the current track is buffered and playing now, so it's safe to attach the
            // gapless next item / lookahead that was held back during the initial buffer
            [self clearLookaheadSuppressionIfReady];
        }
    }]];

    [sPlayerObserverTokens addObject:[[NSNotificationCenter defaultCenter] addObserverForName:AVAudioSessionInterruptionNotification
                                                      object:nil
                                                       queue:[NSOperationQueue mainQueue]
                                                  usingBlock:^(NSNotification *note) {
        AVAudioSessionInterruptionType type = [note.userInfo[AVAudioSessionInterruptionTypeKey] unsignedIntegerValue];
        if (type == AVAudioSessionInterruptionTypeBegan) {
            [self enqueueEvent:@"pause-requested"];
        } else if (type == AVAudioSessionInterruptionTypeEnded) {
            NSUInteger options = [note.userInfo[AVAudioSessionInterruptionOptionKey] unsignedIntegerValue];
            if (options & AVAudioSessionInterruptionOptionShouldResume) {
                [self enqueueEvent:@"play-requested"];
            }
        }
    }]];

    // fallback clear for sSuppressLookahead: the access-log notification above isn't guaranteed
    // for progressive (non-HLS) streams, so once the current item is actually advancing, attach
    // the gapless lookahead that was held back. mirrors clearing at STATE_READY on Android
    sLookaheadClearObserver = [sPlayer addPeriodicTimeObserverForInterval:CMTimeMakeWithSeconds(0.5, NSEC_PER_SEC)
                                                                    queue:dispatch_get_main_queue()
                                                               usingBlock:^(CMTime time) {
        [self clearLookaheadSuppressionIfReady];
    }];
}

// clear the held-back lookahead once the current item is ready and attach the gapless next
// item. mirrors clearing suppressLookahead at STATE_READY on Android. main thread only
+ (void)clearLookaheadSuppressionIfReady {
    if (!sSuppressLookahead || !sPlayer) return;
    if (sPlayer.currentItem.status != AVPlayerItemStatusReadyToPlay) return;
    sSuppressLookahead = NO;
    [sEngineLock lock];
    NSString *nextSrc = sNextSourceUrl;
    NSString *nextId = sNextTrackId;
    [sEngineLock unlock];
    [self syncQueueWithNext:nextSrc trackId:nextId];
    [self ensureWindow];
}

+ (void)removePlayerObservers {
    NSNotificationCenter *center = [NSNotificationCenter defaultCenter];
    for (id<NSObject> token in sPlayerObserverTokens) {
        [center removeObserver:token];
    }
    [sPlayerObserverTokens removeAllObjects];
    if (sLookaheadClearObserver) {
        [sPlayer removeTimeObserver:sLookaheadClearObserver];
        sLookaheadClearObserver = nil;
    }
}

+ (void)applyPendingSeekIfNeeded {
    if (!sPlayer || sPendingSeekMs < 0) return;
    long seekMs = sPendingSeekMs;
    sPendingSeekMs = -1;
    CMTime time = CMTimeMakeWithSeconds(seekMs / 1000.0, NSEC_PER_SEC);
    [sPlayer seekToTime:time toleranceBefore:kCMTimeZero toleranceAfter:kCMTimeZero];
}

+ (void)setPlaybackRate:(float)rate {
    [sEngineLock lock];
    sPlaybackRate = rate;
    [sEngineLock unlock];
    dispatch_async(dispatch_get_main_queue(), ^{
        if (!sPlayer) return;
        if (rate <= 0) {
            [sPlayer pause];
        } else {
            // a resume request can't restart an item parked at its end; seek it back to
            // the start first so playback actually resumes (offline transition stall)
            [self seekCurrentItemToStartIfEnded];
            [sPlayer play];
            sPlayer.rate = rate;
        }
    });
}

+ (void)setVolume:(float)volume {
    [sEngineLock lock];
    sVolume = MAX(0.0f, MIN(1.0f, volume));
    [sEngineLock unlock];
    dispatch_async(dispatch_get_main_queue(), ^{
        sPlayer.volume = MAX(0.0f, MIN(1.0f, volume));
    });
}

+ (void)seekToMs:(long)positionMs {
    [sEngineLock lock];
    sPendingSeekMs = MAX(0, positionMs);
    [sEngineLock unlock];
    dispatch_async(dispatch_get_main_queue(), ^{
        [self applyPendingSeekIfNeeded];
    });
}

+ (long)getPositionMs {
    __block long result = 0;
    if ([NSThread isMainThread]) {
        CMTime time = sPlayer ? sPlayer.currentTime : kCMTimeZero;
        result = CMTIME_IS_VALID(time) ? (long)(CMTimeGetSeconds(time) * 1000) : 0;
    } else {
        dispatch_semaphore_t sem = dispatch_semaphore_create(0);
        dispatch_async(dispatch_get_main_queue(), ^{
            CMTime time = sPlayer ? sPlayer.currentTime : kCMTimeZero;
            result = CMTIME_IS_VALID(time) ? (long)(CMTimeGetSeconds(time) * 1000) : 0;
            dispatch_semaphore_signal(sem);
        });
        dispatch_semaphore_wait(sem, dispatch_time(DISPATCH_TIME_NOW, 50 * NSEC_PER_MSEC));
    }
    return MAX(0, result);
}

+ (long)getDurationMs {
    __block long result = 0;
    if ([NSThread isMainThread]) {
        CMTime duration = sPlayer.currentItem ? sPlayer.currentItem.duration : kCMTimeIndefinite;
        result = CMTIME_IS_VALID(duration) && !CMTIME_IS_INDEFINITE(duration) ? (long)(CMTimeGetSeconds(duration) * 1000) : 0;
    } else {
        dispatch_semaphore_t sem = dispatch_semaphore_create(0);
        dispatch_async(dispatch_get_main_queue(), ^{
            CMTime duration = sPlayer.currentItem ? sPlayer.currentItem.duration : kCMTimeIndefinite;
            result = CMTIME_IS_VALID(duration) && !CMTIME_IS_INDEFINITE(duration) ? (long)(CMTimeGetSeconds(duration) * 1000) : 0;
            dispatch_semaphore_signal(sem);
        });
        dispatch_semaphore_wait(sem, dispatch_time(DISPATCH_TIME_NOW, 50 * NSEC_PER_MSEC));
    }
    return MAX(0, result);
}

+ (BOOL)isActive {
    __block BOOL result = NO;
    if ([NSThread isMainThread]) {
        result = sPlayer && sPlayer.rate > 0;
    } else {
        dispatch_semaphore_t sem = dispatch_semaphore_create(0);
        dispatch_async(dispatch_get_main_queue(), ^{
            result = sPlayer && sPlayer.rate > 0;
            dispatch_semaphore_signal(sem);
        });
        dispatch_semaphore_wait(sem, dispatch_time(DISPATCH_TIME_NOW, 50 * NSEC_PER_MSEC));
    }
    return result;
}

// locked read (sCurrentTrackId is maintained under sEngineLock and never touches sPlayer), so
// no main-queue hop is needed, unlike isActive/getPositionMs
+ (NSString * _Nonnull)currentTrackId {
    [sEngineLock lock];
    NSString *trackId = sCurrentTrackId ?: @"";
    [sEngineLock unlock];
    return trackId;
}

+ (NSString * _Nonnull)consumeEvent {
    [sEngineLock lock];
    NSString *event = sEventQueue.count > 0 ? sEventQueue.firstObject : @"";
    if (sEventQueue.count > 0) [sEventQueue removeObjectAtIndex:0];
    [sEngineLock unlock];
    return event;
}

+ (void)clear {
    [sEngineLock lock];
    sCurrentSourceUrl = @"";
    sCurrentTrackId = @"";
    sNextSourceUrl = @"";
    sNextTrackId = @"";
    sPendingSeekMs = -1;
    sQueueWindow = @[];
    sWindowAnchorHint = 0;
    [sEventQueue removeAllObjects];
    [sEngineLock unlock];

    dispatch_async(dispatch_get_main_queue(), ^{
        sSuppressLookahead = NO;
        [self removePlayerObservers];
        [sPlayer removeAllItems];
        sPlayer = nil;
        [[AVAudioSession sharedInstance] setActive:NO withOptions:AVAudioSessionSetActiveOptionNotifyOthersOnDeactivation error:nil];
    });
}

+ (void)setNextNotificationTrackName:(NSString *)trackName
                          artistName:(NSString *)artistName
                           albumName:(NSString *)albumName
                          artworkUrl:(NSString *)artworkUrl
                     durationSeconds:(double)durationSeconds
                         hasPrevious:(BOOL)hasPrevious
                             hasNext:(BOOL)hasNext {
    [sEngineLock lock];
    sNextNotificationTrackName = trackName ?: @"";
    sNextNotificationArtistName = artistName ?: @"";
    sNextNotificationAlbumName = albumName ?: @"";
    sNextNotificationArtworkUrl = artworkUrl ?: @"";
    sNextNotificationDurationSeconds = durationSeconds;
    sNextNotificationHasPrevious = hasPrevious;
    sNextNotificationHasNext = hasNext;
    [sEngineLock unlock];
}

@end


// MARK: - Module Implementation

@interface AtollaTrackPlaybackNativeModuleImpl : NSObject <atollaTrackPlaybackNativeModule>
@end

@implementation AtollaTrackPlaybackNativeModuleImpl

- (NSString * _Nonnull)cacheAtollaTrackFromUrlWithTrackId:(NSString * _Nonnull)trackId url:(NSString * _Nonnull)url {
    return [AtollaTrackCache cacheTrackFromUrl:trackId url:url authToken:@""];
}

- (void)cacheAtollaTrackFromUrlAsyncWithTrackId:(NSString * _Nonnull)trackId
                                            url:(NSString * _Nonnull)url
                                      authToken:(NSString * _Nonnull)authToken
                                     onComplete:(atollaTrackPlaybackNativeModuleCacheAtollaTrackFromUrlAsyncOnCompleteBlock _Nonnull)onComplete {
    dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
        NSString *result = [AtollaTrackCache cacheTrackFromUrl:trackId url:url authToken:authToken];
        onComplete(result);
    });
}

- (NSString * _Nonnull)getAtollaCachedTrackFileUrlWithTrackId:(NSString * _Nonnull)trackId {
    return [AtollaTrackCache getCachedTrackFileUrl:trackId];
}

- (double)getAtollaTrackCacheEntryCount {
    return (double)[AtollaTrackCache getCacheEntryCount];
}

- (void)clearAtollaTrackCache {
    [AtollaTrackCache clearCache];
}

- (void)setAtollaTrackCacheMaxTracksWithMaxTracks:(double)maxTracks {
    [AtollaTrackCache setCacheMaxTracks:(NSInteger)maxTracks];
}

- (void)cacheAtollaDownloadedTrackFromUrlAsyncWithTrackId:(NSString * _Nonnull)trackId
                                                      url:(NSString * _Nonnull)url
                                                authToken:(NSString * _Nonnull)authToken
                                               onComplete:(atollaTrackPlaybackNativeModuleCacheAtollaDownloadedTrackFromUrlAsyncOnCompleteBlock _Nonnull)onComplete {
    dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
        NSString *result = [AtollaDownloadedTrackCache cacheTrackFromUrl:trackId url:url authToken:authToken];
        onComplete(result);
    });
}

- (NSString * _Nonnull)getAtollaDownloadedTrackFileUrlWithTrackId:(NSString * _Nonnull)trackId {
    return [AtollaDownloadedTrackCache getCachedTrackFileUrl:trackId];
}

- (void)removeAtollaDownloadedTrackWithTrackId:(NSString * _Nonnull)trackId {
    [AtollaDownloadedTrackCache removeTrack:trackId];
}

- (double)getAtollaDownloadedCacheTotalSizeBytes {
    return (double)[AtollaDownloadedTrackCache getTotalSizeBytes];
}

- (void)updateAtollaTrackPlaybackNotificationWithTrackName:(NSString * _Nonnull)trackName
                                                artistName:(NSString * _Nonnull)artistName
                                                 albumName:(NSString * _Nonnull)albumName
                                                artworkUrl:(NSString * _Nonnull)artworkUrl
                                                 isPlaying:(BOOL)isPlaying
                                           positionSeconds:(double)positionSeconds
                                           durationSeconds:(double)durationSeconds
                                               hasPrevious:(BOOL)hasPrevious
                                                   hasNext:(BOOL)hasNext {
    [AtollaMediaSession updateNowPlayingWithTrackName:trackName
                                          artistName:artistName
                                           albumName:albumName
                                          artworkUrl:artworkUrl
                                           isPlaying:isPlaying
                                     positionSeconds:positionSeconds
                                     durationSeconds:durationSeconds
                                         hasPrevious:hasPrevious
                                             hasNext:hasNext];
}

- (void)clearAtollaTrackPlaybackNotification {
    [AtollaMediaSession clearNowPlaying];
}

- (NSString * _Nonnull)consumeAtollaTrackPlaybackNotificationAction {
    return [AtollaMediaSession consumeAction];
}

- (BOOL)ensureAtollaTrackPlaybackNotificationPermission {
    return [AtollaMediaSession ensurePermission];
}

- (NSString * _Nonnull)getAtollaDeviceUserScopeKey {
    return @"ios-user-default";
}

- (void)configureAtollaAudioPlaybackWithCurrentSourceUrl:(NSString * _Nonnull)currentSourceUrl
                                          currentTrackId:(NSString * _Nonnull)currentTrackId
                                        currentDurationMs:(double)currentDurationMs
                                           nextSourceUrl:(NSString * _Nonnull)nextSourceUrl
                                             nextTrackId:(NSString * _Nonnull)nextTrackId
                                           nextDurationMs:(double)nextDurationMs
                                     allowBackwardRebuild:(BOOL)allowBackwardRebuild {
    [AtollaGaplessAudioEngine configureWithCurrentSourceUrl:currentSourceUrl
                                             currentTrackId:currentTrackId
                                           currentDurationMs:currentDurationMs
                                               nextSourceUrl:nextSourceUrl
                                                 nextTrackId:nextTrackId
                                               nextDurationMs:nextDurationMs
                                         allowBackwardRebuild:allowBackwardRebuild];
}

- (void)setAtollaAudioPlaybackRateWithRate:(double)rate {
    [AtollaGaplessAudioEngine setPlaybackRate:(float)rate];
}

- (void)setAtollaAudioPlaybackVolumeWithVolume:(double)volume {
    [AtollaGaplessAudioEngine setVolume:(float)volume];
}

- (void)seekAtollaAudioPlaybackToMsWithPositionMs:(double)positionMs {
    [AtollaGaplessAudioEngine seekToMs:(long)positionMs];
}

- (double)getAtollaAudioPlaybackPositionMs {
    return (double)[AtollaGaplessAudioEngine getPositionMs];
}

- (double)getAtollaAudioPlaybackDurationMs {
    return (double)[AtollaGaplessAudioEngine getDurationMs];
}

- (NSString * _Nonnull)consumeAtollaAudioPlaybackEvent {
    return [AtollaGaplessAudioEngine consumeEvent];
}

- (void)clearAtollaAudioPlayback {
    [AtollaGaplessAudioEngine clear];
}

- (BOOL)getAtollaAudioPlaybackIsActive {
    return [AtollaGaplessAudioEngine isActive];
}

- (NSString * _Nonnull)getAtollaAudioPlaybackCurrentTrackId {
    return [AtollaGaplessAudioEngine currentTrackId];
}

- (void)setAtollaAudioPlaybackNextNotificationWithTrackName:(NSString * _Nonnull)trackName
                                                 artistName:(NSString * _Nonnull)artistName
                                                  albumName:(NSString * _Nonnull)albumName
                                                 artworkUrl:(NSString * _Nonnull)artworkUrl
                                            durationSeconds:(double)durationSeconds
                                                hasPrevious:(BOOL)hasPrevious
                                                    hasNext:(BOOL)hasNext {
    [AtollaGaplessAudioEngine setNextNotificationTrackName:trackName
                                               artistName:artistName
                                                albumName:albumName
                                               artworkUrl:artworkUrl
                                          durationSeconds:durationSeconds
                                              hasPrevious:hasPrevious
                                                  hasNext:hasNext];
}

- (void)setAtollaAudioPlaybackUpcomingQueueWithQueueJson:(NSString * _Nonnull)queueJson {
    [AtollaGaplessAudioEngine setUpcomingQueue:queueJson];
}

- (void)setAtollaTrackPlaybackAuthTokenWithToken:(NSString * _Nonnull)token {
    [AtollaMediaSession setAuthToken:token];
}

@end


// MARK: - Module Factory

@interface AtollaTrackPlaybackNativeModuleFactoryImpl : atollaTrackPlaybackNativeModuleFactory
@end

@implementation AtollaTrackPlaybackNativeModuleFactoryImpl

VALDI_REGISTER_MODULE()

- (id<atollaTrackPlaybackNativeModule> _Nonnull)onLoadModule {
    return [[AtollaTrackPlaybackNativeModuleImpl alloc] init];
}

@end
