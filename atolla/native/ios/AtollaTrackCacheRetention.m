#import "atolla/native/ios/AtollaTrackCacheRetention.h"

BOOL AtollaTrackCacheIsRetained(NSString *fileName, NSSet<NSString *> *retainedKeys) {
    for (NSString *key in retainedKeys) {
        if ([fileName hasPrefix:[key stringByAppendingString:@"."]]) {
            return YES;
        }
    }
    return NO;
}

NSArray<NSString *> *AtollaTrackCacheSelectPruneVictims(NSArray<NSDictionary<NSString *, id> *> *entries,
                                                        NSSet<NSString *> *retainedKeys,
                                                        NSInteger maxTracks) {
    if (maxTracks <= 0) return @[];

    NSInteger overflow = (NSInteger)entries.count - maxTracks;
    if (overflow <= 0) return @[];

    NSMutableArray<NSDictionary *> *evictable = [NSMutableArray array];
    for (NSDictionary *entry in entries) {
        NSString *name = entry[@"name"];
        if (![name isKindOfClass:[NSString class]]) continue;
        if (!AtollaTrackCacheIsRetained(name, retainedKeys)) {
            [evictable addObject:entry];
        }
    }

    [evictable sortUsingComparator:^NSComparisonResult(NSDictionary *a, NSDictionary *b) {
        double mtimeA = [a[@"mtime"] doubleValue];
        double mtimeB = [b[@"mtime"] doubleValue];
        if (mtimeA < mtimeB) return NSOrderedAscending;
        if (mtimeA > mtimeB) return NSOrderedDescending;
        return [a[@"name"] compare:b[@"name"]];
    }];

    NSInteger count = MIN(overflow, (NSInteger)evictable.count);
    NSMutableArray<NSString *> *victims = [NSMutableArray arrayWithCapacity:count];
    for (NSInteger i = 0; i < count; i++) {
        [victims addObject:evictable[i][@"name"]];
    }
    return victims;
}
