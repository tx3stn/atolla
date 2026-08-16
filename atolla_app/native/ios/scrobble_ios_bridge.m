#import "scrobble_ios_bridge.h"
#include "scrobble_tracker.h"

// The scrobble decision is pure and stateless, so this is a thin pass-through to shared Zig
// (scrobble_tracker.zig). Mirrors the Android JNI wrapper (scrobble_jni.cpp).
@implementation AtollaScrobbleTracker

+ (BOOL)shouldCountWithPositionMs:(int64_t)positionMs
                       durationMs:(int64_t)durationMs
                   thresholdRatio:(float)thresholdRatio
                     isNaturalEnd:(BOOL)isNaturalEnd {
    return atolla_scrobble_should_count(positionMs, durationMs, thresholdRatio, isNaturalEnd != NO)
        ? YES
        : NO;
}

@end
