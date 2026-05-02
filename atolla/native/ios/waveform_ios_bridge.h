#pragma once
#import <Foundation/Foundation.h>

@interface AtollaWaveformGenerator : NSObject
// Decode the audio file at audioPath to PCM and render a greyscale alpha-mask PNG.
// Returns PNG data on success, or nil if decoding or rendering fails.
// width/height: output image dimensions — pass 0 to use defaults (512 × 128).
+ (nullable NSData *)generateWaveformFromAudioPath:(nonnull NSString *)audioPath
                                             width:(NSInteger)width
                                            height:(NSInteger)height
    NS_SWIFT_NAME(generateWaveform(audioPath:width:height:));
@end
