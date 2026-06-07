#pragma once
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

// Pure, framework-free playback guard logic, extracted so it can be unit tested on the host
// without AVFoundation (AVPlayerItem/CMTime). Mirrors AtollaPlaybackGuards on Android.

// True when the item has effectively played to its end. A play/resume request cannot restart such
// an item without a seek, mirroring ExoPlayer's STATE_ENDED behaviour. Returns NO for a
// non-positive duration (unknown/streaming). Within ~250ms of the end counts as ended.
BOOL AtollaIsItemAtEnd(double currentSeconds, double durationSeconds);

// Index in the ordered upcoming buffer of the entry to append after the last queued item, or -1
// when the buffer has no known successor. The buffer starts at the entry after currentKey, so
// when the last queued item IS the current one the successor is the first entry. Matches the
// first occurrence of a key: loop buffers with repeated keys have an identical successor at
// every occurrence, so this stays correct. Mirrors nextUpcomingIndex on Android.
NSInteger AtollaNextUpcomingIndex(NSArray<NSString *> *upcomingKeys,
                                  NSString *lastQueuedKey,
                                  NSString *currentKey);

NS_ASSUME_NONNULL_END
