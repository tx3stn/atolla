#pragma once
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

// pure, framework-free playback guard logic, extracted so it can be unit tested on the host
// without AVFoundation (AVPlayerItem/CMTime). mirrors AtollaPlaybackGuards on Android

// true when the item has effectively played to its end. a play/resume request can't restart
// such an item without a seek, mirroring ExoPlayer's STATE_ENDED behaviour. returns NO for a
// non-positive duration (unknown/streaming). within ~250ms of the end counts as ended
BOOL AtollaIsItemAtEnd(double currentSeconds, double durationSeconds);

// locates the current item inside the ordered queue window ([history..., current,
// upcoming...]), or -1 when it isn't present. the hint is the engine's running cursor
// (payload currentIndex, shifted on each transition); when it has drifted, or the window
// contains the same key more than once (loop wraps), the occurrence nearest the hint wins.
// mirrors resolveWindowAnchor on Android
NSInteger AtollaResolveWindowAnchor(NSArray<NSString *> *windowKeys,
                                    NSInteger hintIndex,
                                    NSString *currentKey);

// on a wake-race JS can push a stale earlier track; rebuilding from the start would jerk a
// playing engine backward. true when it is playing and its current item is at/ahead of the
// requested one (window indices; -1 = unknown, disables suppression). allowBackwardRebuild is
// the caller's intent: a deliberate previous/back-to passes YES and is honored.
// mirrors shouldSuppressBackwardRebuild on Android
BOOL AtollaShouldSuppressBackwardRebuild(BOOL isPlaying,
                                         NSInteger requestedAnchor,
                                         NSInteger currentAnchor,
                                         BOOL allowBackwardRebuild);

// a streamed (remote) current track fills its initial playback buffer over the network.
// adding the gapless next item / lookahead at the same time makes them compete for bandwidth
// and briefly stutters the start of playback, so the lookahead is held back until the current
// item is ready to play. local sources buffer from disk without that contention and keep the
// lookahead immediately. true for http/https sources. mirrors shouldDeferLookaheadForSource
// on Android
BOOL AtollaShouldDeferLookaheadForSource(NSString *currentSourceUrl);

// the loaded current item and the requested current track are the same item when their track
// ids match, so a differing source URL for the same id (a stream URL replaced by its cached
// file, or a re-signed stream query) must NOT rebuild the queue and restart playback. falls
// back to comparing source URLs only when a track id is unknown. mirrors mediaItemMatches on
// Android, where the MediaItem carries its mediaId
BOOL AtollaCurrentItemMatches(NSString *loadedTrackId,
                              NSString *requestedTrackId,
                              NSString *loadedSourceUrl,
                              NSString *requestedSourceUrl);

NS_ASSUME_NONNULL_END
