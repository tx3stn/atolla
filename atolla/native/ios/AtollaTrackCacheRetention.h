#pragma once
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

// pure selection logic for the streaming track cache's sliding-window prune, extracted so it
// can be unit tested on the host without NSFileManager. mirrors AtollaTrackCacheRetention on
// Android

// a file belongs to a retained track when its name is "$key.$ext"; matches how the cache names
// files and how resolveExistingTrackFileWithKey locates them
BOOL AtollaTrackCacheIsRetained(NSString *fileName, NSSet<NSString *> *retainedKeys);

// selects the filenames to evict: oldest-first among non-retained files only, capped at the
// overflow beyond maxTracks. retained files are never returned even when that leaves the cache
// above max (transient; the JS window is bounded by maxTracks so it converges).
// entries: array of @{@"name": NSString, @"mtime": NSNumber} (mtime any monotonic seconds value)
NSArray<NSString *> *AtollaTrackCacheSelectPruneVictims(NSArray<NSDictionary<NSString *, id> *> *entries,
                                                        NSSet<NSString *> *retainedKeys,
                                                        NSInteger maxTracks);

NS_ASSUME_NONNULL_END
