#import "atolla/native/ios/AtollaPlaybackGuards.h"

BOOL AtollaIsItemAtEnd(double currentSeconds, double durationSeconds) {
    if (durationSeconds <= 0) return NO;
    // Within ~250ms of the end counts as ended.
    return currentSeconds >= durationSeconds - 0.25;
}

NSInteger AtollaNextUpcomingIndex(NSArray<NSString *> *upcomingKeys,
                                  NSString *lastQueuedKey,
                                  NSString *currentKey) {
    if (upcomingKeys.count == 0 || lastQueuedKey.length == 0) return -1;

    NSUInteger lastIndex = [upcomingKeys indexOfObject:lastQueuedKey];
    if (lastIndex != NSNotFound) {
        return lastIndex + 1 < upcomingKeys.count ? (NSInteger)(lastIndex + 1) : -1;
    }

    return [lastQueuedKey isEqualToString:currentKey] ? 0 : -1;
}
