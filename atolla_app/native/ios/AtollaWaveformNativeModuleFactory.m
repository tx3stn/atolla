#import <atolla_appTypes/atolla_appTypes.h>
#import <valdi_core/SCValdiModuleFactoryRegistry.h>
#import <Foundation/Foundation.h>
#import "waveform_ios_bridge.h"


// MARK: - Module Implementation

@interface AtollaWaveformNativeModuleImpl : NSObject <atolla_appWaveformNativeModule>
@end

@implementation AtollaWaveformNativeModuleImpl

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
