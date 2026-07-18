#pragma once
#import <Foundation/Foundation.h>

// Thin pass-through to the shared Zig scrobble "played?" decision
// (atolla/native/zig/scrobble_tracker.zig). Stateless: the audio engine calls it at the discrete
// points a track ends or is left. Mirrors AtollaScrobbleNative on Android.
@interface AtollaScrobbleTracker : NSObject
// YES when the track should be scrobbled: a natural end always counts, otherwise the track counts
// only when the leave position reached thresholdRatio of the duration.
+ (BOOL)shouldCountWithPositionMs:(int64_t)positionMs
                       durationMs:(int64_t)durationMs
                   thresholdRatio:(float)thresholdRatio
                     isNaturalEnd:(BOOL)isNaturalEnd
    NS_SWIFT_NAME(shouldCount(positionMs:durationMs:thresholdRatio:isNaturalEnd:));
@end
