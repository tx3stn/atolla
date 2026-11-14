#pragma once
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

typedef NSString *_Nullable (^AtollaTrackPathLookup)(NSString *trackId);

NSArray<NSDictionary<NSString *, id> *> *AtollaMediaUploadTracks(NSArray<NSString *> *trackIds,
                                                                 BOOL sendFiles,
                                                                 AtollaTrackPathLookup downloadedPath,
                                                                 AtollaTrackPathLookup cachedPath);

NS_ASSUME_NONNULL_END
