#pragma once
#import <Foundation/Foundation.h>

@interface AtollaWaveformGenerator : NSObject
// extract 300 RMS amplitude control points from an audio file.
// returns NSData containing float32[300] values on success, or nil on failure
+ (nullable NSData *)extractAmpsFromAudioPath:(nonnull NSString *)audioPath
    NS_SWIFT_NAME(extractAmps(audioPath:));

// render a greyscale alpha-mask PNG from pre-computed float32 amplitude control points.
// ampsData: NSData containing float32 values (num_amps floats).
// width/height: output image dimensions, pass 0 to use defaults (500 × 100).
// returns PNG data on success, or nil on failure
+ (nullable NSData *)renderWaveformFromAmps:(nonnull NSData *)ampsData
                                      width:(NSInteger)width
                                     height:(NSInteger)height
    NS_SWIFT_NAME(renderWaveform(amps:width:height:));
@end
