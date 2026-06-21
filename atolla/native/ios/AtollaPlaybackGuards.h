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

// On a wake-race JS can push a stale earlier track; rebuilding from the start would jerk a
// playing engine backward. True when it is playing and its current item is at/ahead of the
// requested one (window indices; -1 = unknown, disables suppression). allowBackwardRebuild is
// the caller's intent — a deliberate previous/back-to passes YES and is honored.
// Mirrors shouldSuppressBackwardRebuild on Android.
BOOL AtollaShouldSuppressBackwardRebuild(BOOL isPlaying,
                                         NSInteger requestedAnchor,
                                         NSInteger currentAnchor,
                                         BOOL allowBackwardRebuild);

// A streamed (remote) current track fills its initial playback buffer over the network.
// Adding the gapless next item / lookahead at the same time makes them compete for bandwidth
// and briefly stutters the start of playback, so the lookahead is held back until the current
// item is ready to play. Local sources buffer from disk without that contention and keep the
// lookahead immediately. True for http/https sources. Mirrors shouldDeferLookaheadForSource
// on Android.
BOOL AtollaShouldDeferLookaheadForSource(NSString *currentSourceUrl);

NS_ASSUME_NONNULL_END
