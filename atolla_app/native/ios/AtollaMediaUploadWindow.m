#import "atolla_app/native/ios/AtollaMediaUploadWindow.h"

NSArray<NSDictionary<NSString *, id> *> *AtollaMediaUploadTracks(NSArray<NSString *> *trackIds,
                                                                 BOOL sendFiles,
                                                                 AtollaTrackPathLookup downloadedPath,
                                                                 AtollaTrackPathLookup cachedPath) {
    NSMutableArray<NSDictionary<NSString *, id> *> *tracks = [NSMutableArray arrayWithCapacity:trackIds.count];

    for (NSString *trackId in trackIds) {
        NSString *path = sendFiles ? (downloadedPath(trackId) ?: cachedPath(trackId)) : nil;
        [tracks addObject:@{@"id": trackId, @"path": path ?: [NSNull null]}];
    }

    return tracks;
}
