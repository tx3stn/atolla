#import <atolla_appTypes/atolla_appTypes.h>
#import <valdi_core/SCValdiModuleFactoryRegistry.h>
#import <Foundation/Foundation.h>
#import "waveform_ios_bridge.h"
#include "waveform_store.h"


// MARK: - Waveform Store

static NSURL *AtollaWaveformsDir(void) {
    static NSURL *dir;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        NSURL *docs = [[NSFileManager.defaultManager URLsForDirectory:NSDocumentDirectory
                                                            inDomains:NSUserDomainMask] firstObject];
        if (!docs) return;
        NSURL *atollaDir = [docs URLByAppendingPathComponent:@"atolla" isDirectory:YES];
        NSURL *waveformsDir = [atollaDir URLByAppendingPathComponent:@"waveforms" isDirectory:YES];
        if (![NSFileManager.defaultManager createDirectoryAtURL:waveformsDir
                                    withIntermediateDirectories:YES
                                                     attributes:nil
                                                          error:nil]) return;
        [atollaDir setResourceValue:@YES forKey:NSURLIsExcludedFromBackupKey error:nil];
        dir = waveformsDir;
    });
    return dir;
}

static void AtollaWaveformStoreClear(void) {
    NSURL *dir = AtollaWaveformsDir();
    if (!dir) return;
    const char *dirPath = dir.fileSystemRepresentation;
    atolla_waveform_store_clear((const uint8_t *)dirPath, strlen(dirPath));
}

static NSInteger AtollaWaveformStoreCount(void) {
    NSURL *dir = AtollaWaveformsDir();
    if (!dir) return 0;
    const char *dirPath = dir.fileSystemRepresentation;
    return atolla_waveform_store_count((const uint8_t *)dirPath, strlen(dirPath));
}

static BOOL AtollaWaveformStoreHas(NSString *trackId) {
    NSURL *dir = AtollaWaveformsDir();
    if (!dir) return NO;
    const char *dirPath = dir.fileSystemRepresentation;
    const char *trackIdBytes = trackId.UTF8String;
    return atolla_waveform_store_has((const uint8_t *)dirPath, strlen(dirPath),
                                     (const uint8_t *)trackIdBytes, strlen(trackIdBytes));
}

static NSData *AtollaWaveformStoreRead(NSString *trackId) {
    NSURL *dir = AtollaWaveformsDir();
    if (!dir) return nil;
    const char *dirPath = dir.fileSystemRepresentation;
    const char *trackIdBytes = trackId.UTF8String;
    uint8_t amps[ATOLLA_WAVEFORM_STORE_MAX_BYTES];
    size_t ampsLen = 0;
    if (!atolla_waveform_store_read((const uint8_t *)dirPath, strlen(dirPath),
                                    (const uint8_t *)trackIdBytes, strlen(trackIdBytes),
                                    amps, &ampsLen)) return nil;
    return [NSData dataWithBytes:amps length:ampsLen];
}

static BOOL AtollaWaveformStoreWrite(NSString *trackId, NSData *amps) {
    NSURL *dir = AtollaWaveformsDir();
    if (!dir) return NO;
    const char *dirPath = dir.fileSystemRepresentation;
    const char *trackIdBytes = trackId.UTF8String;
    return atolla_waveform_store_write((const uint8_t *)dirPath, strlen(dirPath),
                                       (const uint8_t *)trackIdBytes, strlen(trackIdBytes),
                                       amps.bytes, amps.length);
}


// MARK: - Module Implementation

@interface AtollaWaveformNativeModuleImpl : NSObject <atolla_appWaveformNativeModule>
@end

@implementation AtollaWaveformNativeModuleImpl

- (void)clearAtollaWaveforms {
    AtollaWaveformStoreClear();
}

- (void)generateAtollaWaveformAmpsAsyncWithTrackId:(NSString * _Nonnull)trackId
                                          audioPath:(NSString * _Nonnull)audioPath
                                         onComplete:(atolla_appWaveformNativeModuleGenerateAtollaWaveformAmpsAsyncOnCompleteBlock _Nonnull)onComplete {
    dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
        NSString *resolvedPath = [audioPath hasPrefix:@"file://"]
            ? [audioPath substringFromIndex:7]
            : audioPath;

        NSData *ampsData = [AtollaWaveformGenerator extractAmpsFromAudioPath:resolvedPath];
        NSString *ampsBase64 = ampsData ? [ampsData base64EncodedStringWithOptions:0] : @"";
        onComplete(ampsBase64);
    });
}

- (void)generateAtollaWaveformAsyncWithTrackId:(NSString * _Nonnull)trackId
                                     audioPath:(NSString * _Nonnull)audioPath
                                    onComplete:(atolla_appWaveformNativeModuleGenerateAtollaWaveformAsyncOnCompleteBlock _Nonnull)onComplete {
    dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
        NSString *resolvedPath = [audioPath hasPrefix:@"file://"]
            ? [audioPath substringFromIndex:7]
            : audioPath;

        NSData *amps = [AtollaWaveformGenerator extractAmpsFromAudioPath:resolvedPath];
        onComplete(amps != nil && AtollaWaveformStoreWrite(trackId, amps));
    });
}

- (void)getAtollaWaveformCountAsyncWithOnComplete:(atolla_appWaveformNativeModuleGetAtollaWaveformCountAsyncOnCompleteBlock _Nonnull)onComplete {
    dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
        onComplete((double)AtollaWaveformStoreCount());
    });
}

- (BOOL)hasAtollaWaveformWithTrackId:(NSString * _Nonnull)trackId {
    return AtollaWaveformStoreHas(trackId);
}

- (void)renderAtollaWaveformAsyncWithTrackId:(NSString * _Nonnull)trackId
                                       width:(double)width
                                      height:(double)height
                                  onComplete:(atolla_appWaveformNativeModuleRenderAtollaWaveformAsyncOnCompleteBlock _Nonnull)onComplete {
    dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
        NSData *amps = AtollaWaveformStoreRead(trackId);
        NSData *pngData = amps ? [AtollaWaveformGenerator renderWaveformFromAmps:amps
                                                                           width:(NSInteger)width
                                                                          height:(NSInteger)height] : nil;
        if (!pngData) {
            onComplete(@"");
            return;
        }

        NSURL *tmpDir = [NSURL fileURLWithPath:NSTemporaryDirectory() isDirectory:YES];
        NSURL *tmpFile = [tmpDir URLByAppendingPathComponent:
            [NSString stringWithFormat:@"waveform-%@.png", [[NSUUID UUID] UUIDString]]];
        NSString *outputUrl = [pngData writeToURL:tmpFile atomically:YES]
            ? [@"file://" stringByAppendingString:tmpFile.path]
            : @"";
        onComplete(outputUrl);
    });
}

- (void)renderAtollaWaveformFromAmpsAsyncWithAmpsBase64:(NSString * _Nonnull)ampsBase64
                                                  width:(double)width
                                                 height:(double)height
                                             onComplete:(atolla_appWaveformNativeModuleRenderAtollaWaveformFromAmpsAsyncOnCompleteBlock _Nonnull)onComplete {
    dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
        NSData *ampsData = [[NSData alloc] initWithBase64EncodedString:ampsBase64 options:0];
        NSData *pngData = ampsData ? [AtollaWaveformGenerator renderWaveformFromAmps:ampsData
                                                                               width:(NSInteger)width
                                                                              height:(NSInteger)height] : nil;
        if (!pngData) {
            onComplete(@"");
            return;
        }

        NSURL *tmpDir = [NSURL fileURLWithPath:NSTemporaryDirectory() isDirectory:YES];
        NSURL *tmpFile = [tmpDir URLByAppendingPathComponent:
            [NSString stringWithFormat:@"waveform-%@.png", [[NSUUID UUID] UUIDString]]];
        NSString *outputUrl = [pngData writeToURL:tmpFile atomically:YES]
            ? [@"file://" stringByAppendingString:tmpFile.path]
            : @"";
        onComplete(outputUrl);
    });
}

- (void)storeAtollaWaveformAmpsWithTrackId:(NSString * _Nonnull)trackId
                                ampsBase64:(NSString * _Nonnull)ampsBase64 {
    NSData *amps = [[NSData alloc] initWithBase64EncodedString:ampsBase64 options:0];
    if (amps) AtollaWaveformStoreWrite(trackId, amps);
}

@end


// MARK: - Module Factory

@interface AtollaWaveformNativeModuleFactoryImpl : atolla_appWaveformNativeModuleFactory
@end

@implementation AtollaWaveformNativeModuleFactoryImpl

VALDI_REGISTER_MODULE()

- (id<atolla_appWaveformNativeModule> _Nonnull)onLoadModule {
    return [[AtollaWaveformNativeModuleImpl alloc] init];
}

@end
