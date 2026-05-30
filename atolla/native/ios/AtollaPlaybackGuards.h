#pragma once
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

// Pure, framework-free playback guard logic, extracted so it can be unit tested on the host
// without AVFoundation (AVPlayerItem/CMTime). Mirrors AtollaPlaybackGuards on Android.

// True when the item has effectively played to its end. A play/resume request cannot restart such
// an item without a seek, mirroring ExoPlayer's STATE_ENDED behaviour. Returns NO for a
// non-positive duration (unknown/streaming). Within ~250ms of the end counts as ended.
BOOL AtollaIsItemAtEnd(double currentSeconds, double durationSeconds);

NS_ASSUME_NONNULL_END
