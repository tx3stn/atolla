#import <atollaTypes/atollaTypes.h>
#import <valdi_core/SCValdiModuleFactoryRegistry.h>
#import <AVFoundation/AVFoundation.h>
#import <MediaPlayer/MediaPlayer.h>
#import <Foundation/Foundation.h>
// MARK: - Track File Cache

@interface AtollaTrackCache : NSObject

+ (NSString * _Nonnull)cacheTrackFromUrl:(NSString * _Nonnull)trackId url:(NSString * _Nonnull)url;
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

// Downloads url directly to a temp file on disk (no in-memory buffering).
// Returns the temp file URL and populates outMimeType on success, nil on failure.
// Caller is responsible for deleting the temp file.
+ (nullable NSURL *)streamDownloadFromURL:(NSURL *)sourceURL
                                 mimeType:(NSString * _Nullable * _Nonnull)outMimeType {
    NSURLSessionConfiguration *config = [NSURLSessionConfiguration ephemeralSessionConfiguration];
    config.timeoutIntervalForRequest = 30.0;
    config.timeoutIntervalForResource = 300.0;
    NSURLSession *session = [NSURLSession sessionWithConfiguration:config];

    NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:sourceURL
                                                           cachePolicy:NSURLRequestReloadIgnoringLocalCacheData
                                                       timeoutInterval:30.0];
    [request setValue:@"audio/*,*/*" forHTTPHeaderField:@"Accept"];

    dispatch_semaphore_t sem = dispatch_semaphore_create(0);
    __block NSURL *tmpResult = nil;
    __block NSString *mimeResult = nil;

    NSURLSessionDownloadTask *task = [session downloadTaskWithRequest:request
        completionHandler:^(NSURL *location, NSURLResponse *resp, NSError *error) {
            NSHTTPURLResponse *httpResp = (NSHTTPURLResponse *)resp;
            if (!error && location &&
                httpResp.statusCode >= 200 && httpResp.statusCode < 300) {
                mimeResult = [httpResp MIMEType] ?: @"application/octet-stream";
                // location is deleted after this block, so move it somewhere persistent.
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

+ (NSString * _Nonnull)cacheTrackFromUrl:(NSString * _Nonnull)trackId url:(NSString * _Nonnull)url {
    if (trackId.length == 0 || url.length == 0) return @"";

    NSURL *dir = [self resolveCacheDir];
    if (!dir) return @"";
    NSString *key = [self safeTrackKey:trackId];

    // Fast path: check cache and register in-progress (brief lock).
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

    // Download without holding the lock so getCachedTrackFileUrl is not blocked
    // during slow network I/O. Streams directly to disk — no in-memory buffering.
    NSURL *sourceURL = [NSURL URLWithString:url];
    if (!sourceURL) {
        [sTrackCacheLock lock];
        [sInProgressKeys removeObject:key];
        [sTrackCacheLock unlock];
        return @"";
    }

    NSString *mimeType = nil;
    NSURL *downloadedTmp = [self streamDownloadFromURL:sourceURL mimeType:&mimeType];

    NSString *result = @"";
    if (downloadedTmp && mimeType && [self isLikelyAudioMimeType:mimeType]) {
        NSString *ext = [self extensionFromMimeType:mimeType];
        // Brief lock to finalize: delete stale files, rename temp, prune.
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

+ (NSString * _Nonnull)cacheTrackFromUrl:(NSString * _Nonnull)trackId url:(NSString * _Nonnull)url;
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

+ (NSString * _Nonnull)cacheTrackFromUrl:(NSString * _Nonnull)trackId url:(NSString * _Nonnull)url {
    if (trackId.length == 0 || url.length == 0) return @"";

    NSURL *dir = [self resolveFilesDir];
    if (!dir) return @"";
    NSString *key = [self safeKey:trackId];

    // Fast path: check cache and register in-progress (brief lock).
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

    // Download without holding the lock so getCachedTrackFileUrl is not blocked
    // during slow network I/O. Streams directly to disk — no in-memory buffering.
    NSURL *sourceURL = [NSURL URLWithString:url];
    if (!sourceURL) {
        [sDownloadedTrackCacheLock lock];
        [sInProgressDownloadedKeys removeObject:key];
        [sDownloadedTrackCacheLock unlock];
        return @"";
    }

    NSString *mimeType = nil;
    NSURL *downloadedTmp = [AtollaTrackCache streamDownloadFromURL:sourceURL mimeType:&mimeType];

    NSString *result = @"";
    if (downloadedTmp && mimeType && [AtollaTrackCache isLikelyAudioMimeType:mimeType]) {
        NSString *ext = [AtollaTrackCache extensionFromMimeType:mimeType];
        // Brief lock to finalize: delete stale files, move temp, touch.
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
@end

@implementation AtollaMediaSession

static NSString *sPendingAction = @"";
static NSLock *sMediaSessionLock;
static BOOL sCommandsRegistered = NO;

+ (void)initialize {
    if (self == [AtollaMediaSession class]) {
        sMediaSessionLock = [[NSLock alloc] init];
    }
}

+ (void)ensureCommandCenterRegistered {
    if (sCommandsRegistered) return;
    sCommandsRegistered = YES;

    MPRemoteCommandCenter *cc = [MPRemoteCommandCenter sharedCommandCenter];

    [cc.playCommand addTargetWithHandler:^MPRemoteCommandHandlerStatus(MPRemoteCommandEvent * _Nonnull event) {
        [sMediaSessionLock lock];
        sPendingAction = @"play";
        [sMediaSessionLock unlock];
        return MPRemoteCommandHandlerStatusSuccess;
    }];

    [cc.pauseCommand addTargetWithHandler:^MPRemoteCommandHandlerStatus(MPRemoteCommandEvent * _Nonnull event) {
        [sMediaSessionLock lock];
        sPendingAction = @"pause";
        [sMediaSessionLock unlock];
        return MPRemoteCommandHandlerStatusSuccess;
    }];

    [cc.togglePlayPauseCommand addTargetWithHandler:^MPRemoteCommandHandlerStatus(MPRemoteCommandEvent * _Nonnull event) {
        [sMediaSessionLock lock];
        sPendingAction = @"play";
        [sMediaSessionLock unlock];
        return MPRemoteCommandHandlerStatusSuccess;
    }];

    [cc.nextTrackCommand addTargetWithHandler:^MPRemoteCommandHandlerStatus(MPRemoteCommandEvent * _Nonnull event) {
        [sMediaSessionLock lock];
        sPendingAction = @"next";
        [sMediaSessionLock unlock];
        return MPRemoteCommandHandlerStatusSuccess;
    }];

    [cc.previousTrackCommand addTargetWithHandler:^MPRemoteCommandHandlerStatus(MPRemoteCommandEvent * _Nonnull event) {
        [sMediaSessionLock lock];
        sPendingAction = @"previous";
        [sMediaSessionLock unlock];
        return MPRemoteCommandHandlerStatusSuccess;
    }];

    [cc.stopCommand addTargetWithHandler:^MPRemoteCommandHandlerStatus(MPRemoteCommandEvent * _Nonnull event) {
        [sMediaSessionLock lock];
        sPendingAction = @"pause";
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
                NSData *data = [NSData dataWithContentsOfURL:url];
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
    NSString *action = sPendingAction;
    sPendingAction = @"";
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
                         nextDurationMs:(double)nextDurationMs;
+ (void)setPlaybackRate:(float)rate;
+ (void)setVolume:(float)volume;
+ (void)seekToMs:(long)positionMs;
+ (long)getPositionMs;
+ (long)getDurationMs;
+ (BOOL)isActive;
+ (NSString * _Nonnull)consumeEvent;
+ (void)clear;
+ (void)setNextNotificationTrackName:(NSString *)trackName
                          artistName:(NSString *)artistName
                           albumName:(NSString *)albumName
                          artworkUrl:(NSString *)artworkUrl
                     durationSeconds:(double)durationSeconds
                         hasPrevious:(BOOL)hasPrevious
                             hasNext:(BOOL)hasNext;

@end

@implementation AtollaGaplessAudioEngine

static AVQueuePlayer *sPlayer = nil;
static id<NSObject> sPlayerTimeObserver = nil;
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

+ (void)initialize {
    if (self == [AtollaGaplessAudioEngine class]) {
        sEventQueue = [NSMutableArray array];
        sEngineLock = [[NSLock alloc] init];
    }
}

+ (void)enqueueEvent:(NSString *)event {
    [sEngineLock lock];
    if (sEventQueue.count >= 32) [sEventQueue removeObjectAtIndex:0];
    [sEventQueue addObject:event];
    [sEngineLock unlock];
}

+ (void)configureWithCurrentSourceUrl:(NSString *)currentSourceUrl
                       currentTrackId:(NSString *)currentTrackId
                     currentDurationMs:(double)currentDurationMs
                       nextSourceUrl:(NSString *)nextSourceUrl
                           nextTrackId:(NSString *)nextTrackId
                         nextDurationMs:(double)nextDurationMs {
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

        BOOL currentMatches = NO;
        AVPlayerItem *currentItem = sPlayer.currentItem;
        if (currentItem) {
            NSString *currentUrl = [(AVURLAsset *)currentItem.asset URL].absoluteString;
            currentMatches = ([currentUrl isEqualToString:currentSourceUrl] ||
                              [currentTrackId isEqualToString:sCurrentTrackId]);
        }

        if (!currentMatches) {
            [sPlayer removeAllItems];
            AVPlayerItem *item = [self playerItemForUrl:currentSourceUrl];
            [sPlayer insertItem:item afterItem:nil];
            if (nextSourceUrl.length > 0 && ![nextSourceUrl isEqualToString:currentSourceUrl]) {
                AVPlayerItem *nextItem = [self playerItemForUrl:nextSourceUrl];
                [sPlayer insertItem:nextItem afterItem:item];
            }
            [sPlayer play];
            if (sPlaybackRate > 0) sPlayer.rate = sPlaybackRate;
            [self applyPendingSeekIfNeeded];
        } else {
            [self syncQueueWithNext:nextSourceUrl];
            if (sPlaybackRate > 0) {
                [sPlayer play];
                sPlayer.rate = sPlaybackRate;
            }
        }
    });
}

+ (AVPlayerItem *)playerItemForUrl:(NSString *)urlString {
    NSURL *url = [NSURL URLWithString:urlString];
    return [AVPlayerItem playerItemWithURL:url];
}

+ (void)syncQueueWithNext:(NSString *)nextSourceUrl {
    NSArray<AVPlayerItem *> *items = sPlayer.items;
    while (items.count > 1) {
        [sPlayer removeItem:items.lastObject];
        items = sPlayer.items;
    }
    if (nextSourceUrl.length > 0 && ![nextSourceUrl isEqualToString:sCurrentSourceUrl]) {
        AVPlayerItem *nextItem = [self playerItemForUrl:nextSourceUrl];
        [sPlayer insertItem:nextItem afterItem:sPlayer.currentItem];
    }
}

+ (void)ensureAudioSession {
    NSError *error = nil;
    [[AVAudioSession sharedInstance] setCategory:AVAudioSessionCategoryPlayback error:&error];
    [[AVAudioSession sharedInstance] setActive:YES error:&error];
}

+ (void)registerPlayerObservers {
    [[NSNotificationCenter defaultCenter] addObserverForName:AVPlayerItemDidPlayToEndTimeNotification
                                                      object:nil
                                                       queue:[NSOperationQueue mainQueue]
                                                  usingBlock:^(NSNotification *note) {
        [self enqueueEvent:@"completed"];

        [sEngineLock lock];
        NSString *nextSrc = sNextSourceUrl;
        NSString *nextId = sNextTrackId;
        NSString *notifTrackName = sNextNotificationTrackName;
        NSString *notifArtistName = sNextNotificationArtistName;
        NSString *notifAlbumName = sNextNotificationAlbumName;
        NSString *notifArtworkUrl = sNextNotificationArtworkUrl;
        double notifDuration = sNextNotificationDurationSeconds;
        BOOL notifHasPrevious = sNextNotificationHasPrevious;
        BOOL notifHasNext = sNextNotificationHasNext;
        sCurrentSourceUrl = nextSrc;
        sCurrentTrackId = nextId;
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

        if (notifTrackName.length > 0) {
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
    }];

    [[NSNotificationCenter defaultCenter] addObserverForName:AVPlayerItemFailedToPlayToEndTimeNotification
                                                      object:nil
                                                       queue:[NSOperationQueue mainQueue]
                                                  usingBlock:^(NSNotification *note) {
        NSError *err = note.userInfo[AVPlayerItemFailedToPlayToEndTimeErrorKey];
        NSString *msg = err.localizedDescription ?: @"Playback error";
        [self enqueueEvent:[@"error:" stringByAppendingString:msg]];
    }];

    [[NSNotificationCenter defaultCenter] addObserverForName:AVPlayerItemNewAccessLogEntryNotification
                                                      object:nil
                                                       queue:[NSOperationQueue mainQueue]
                                                  usingBlock:^(NSNotification *note) {
        if (((AVPlayerItem *)note.object).status == AVPlayerItemStatusReadyToPlay) {
            [self enqueueEvent:@"loaded"];
            [self applyPendingSeekIfNeeded];
        }
    }];

    [[NSNotificationCenter defaultCenter] addObserverForName:AVAudioSessionInterruptionNotification
                                                      object:nil
                                                       queue:[NSOperationQueue mainQueue]
                                                  usingBlock:^(NSNotification *note) {
        AVAudioSessionInterruptionType type = [note.userInfo[AVAudioSessionInterruptionTypeKey] unsignedIntegerValue];
        if (type == AVAudioSessionInterruptionTypeBegan) {
            [self enqueueEvent:@"pause-requested"];
        }
    }];
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
    [sEventQueue removeAllObjects];
    [sEngineLock unlock];

    dispatch_async(dispatch_get_main_queue(), ^{
        [[NSNotificationCenter defaultCenter] removeObserver:sPlayer];
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
    return [AtollaTrackCache cacheTrackFromUrl:trackId url:url];
}

- (void)cacheAtollaTrackFromUrlAsyncWithTrackId:(NSString * _Nonnull)trackId
                                            url:(NSString * _Nonnull)url
                                     onComplete:(atollaTrackPlaybackNativeModuleCacheAtollaTrackFromUrlAsyncOnCompleteBlock _Nonnull)onComplete {
    dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
        NSString *result = [AtollaTrackCache cacheTrackFromUrl:trackId url:url];
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
                                               onComplete:(atollaTrackPlaybackNativeModuleCacheAtollaDownloadedTrackFromUrlAsyncOnCompleteBlock _Nonnull)onComplete {
    dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
        NSString *result = [AtollaDownloadedTrackCache cacheTrackFromUrl:trackId url:url];
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
                                           nextDurationMs:(double)nextDurationMs {
    [AtollaGaplessAudioEngine configureWithCurrentSourceUrl:currentSourceUrl
                                             currentTrackId:currentTrackId
                                           currentDurationMs:currentDurationMs
                                               nextSourceUrl:nextSourceUrl
                                                 nextTrackId:nextTrackId
                                               nextDurationMs:nextDurationMs];
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
