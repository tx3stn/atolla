#import "atolla/native/ios/AtollaPlaybackGuards.h"

BOOL AtollaIsItemAtEnd(double currentSeconds, double durationSeconds) {
    if (durationSeconds <= 0) return NO;
    // within ~250ms of the end counts as ended
    return currentSeconds >= durationSeconds - 0.25;
}

NSInteger AtollaResolveWindowAnchor(NSArray<NSString *> *windowKeys,
                                    NSInteger hintIndex,
                                    NSString *currentKey) {
    if (windowKeys.count == 0 || currentKey.length == 0) return -1;

    NSInteger clampedHint = MAX(0, MIN(hintIndex, (NSInteger)windowKeys.count - 1));
    if ([windowKeys[clampedHint] isEqualToString:currentKey]) {
        return clampedHint;
    }

    NSInteger best = -1;
    NSInteger bestDistance = NSIntegerMax;
    for (NSUInteger index = 0; index < windowKeys.count; index++) {
        if (![windowKeys[index] isEqualToString:currentKey]) continue;
        NSInteger distance = labs((NSInteger)index - clampedHint);
        if (distance < bestDistance) {
            best = (NSInteger)index;
            bestDistance = distance;
        }
    }
    return best;
}

BOOL AtollaShouldSuppressBackwardRebuild(BOOL isPlaying,
                                         NSInteger requestedAnchor,
                                         NSInteger currentAnchor,
                                         BOOL allowBackwardRebuild) {
    return !allowBackwardRebuild && isPlaying && requestedAnchor >= 0 && currentAnchor >= 0 &&
           currentAnchor >= requestedAnchor;
}

BOOL AtollaShouldDeferLookaheadForSource(NSString *currentSourceUrl) {
    return [currentSourceUrl.lowercaseString hasPrefix:@"http://"] ||
           [currentSourceUrl.lowercaseString hasPrefix:@"https://"];
}

BOOL AtollaCurrentItemMatches(NSString *loadedTrackId,
                              NSString *requestedTrackId,
                              NSString *loadedSourceUrl,
                              NSString *requestedSourceUrl) {
    if (loadedTrackId.length > 0 && requestedTrackId.length > 0) {
        return [loadedTrackId isEqualToString:requestedTrackId];
    }
    return [loadedSourceUrl isEqualToString:requestedSourceUrl];
}
