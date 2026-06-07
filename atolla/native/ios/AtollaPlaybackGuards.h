#pragma once
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

// Pure, framework-free playback guard logic, extracted so it can be unit tested on the host
// without AVFoundation (AVPlayerItem/CMTime). Mirrors AtollaPlaybackGuards on Android.

// True when the item has effectively played to its end. A play/resume request cannot restart such
// an item without a seek, mirroring ExoPlayer's STATE_ENDED behaviour. Returns NO for a
// non-positive duration (unknown/streaming). Within ~250ms of the end counts as ended.
BOOL AtollaIsItemAtEnd(double currentSeconds, double durationSeconds);

// Locates the current item inside the ordered queue window ([history..., current,
// upcoming...]), or -1 when it isn't present. The hint is the engine's running cursor
// (payload currentIndex, shifted on each transition); when it has drifted — or the window
// contains the same key more than once (loop wraps) — the occurrence nearest the hint wins.
// Mirrors resolveWindowAnchor on Android.
NSInteger AtollaResolveWindowAnchor(NSArray<NSString *> *windowKeys,
                                    NSInteger hintIndex,
                                    NSString *currentKey);

NS_ASSUME_NONNULL_END
