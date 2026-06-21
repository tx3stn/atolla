#pragma once
#import <Foundation/Foundation.h>

@interface AtollaWaveformGenerator : NSObject
// decode the audio file at audioPath to PCM and render a greyscale alpha-mask PNG.
// returns PNG data on success, or nil if decoding or rendering fails.
// width/height: output image dimensions, pass 0 to use defaults (512 × 128)
+ (nullable NSData *)generateWaveformFromAudioPath:(nonnull NSString *)audioPath
                                             width:(NSInteger)width
                                            height:(NSInteger)height
    NS_SWIFT_NAME(generateWaveform(audioPath:width:height:));

// extract 100 RMS amplitude control points from an audio file.
// returns NSData containing float32[100] values on success, or nil on failure
+ (nullable NSData *)extractAmpsFromAudioPath:(nonnull NSString *)audioPath
    NS_SWIFT_NAME(extractAmps(audioPath:));

// render a greyscale alpha-mask PNG from pre-computed float32 amplitude control points.
// ampsData: NSData containing float32 values (num_amps floats).
// width/height: output image dimensions, pass 0 to use defaults (512 × 128).
// returns PNG data on success, or nil on failure
+ (nullable NSData *)renderWaveformFromAmps:(nonnull NSData *)ampsData
                                      width:(NSInteger)width
                                     height:(NSInteger)height
    NS_SWIFT_NAME(renderWaveform(amps:width:height:));
@end
