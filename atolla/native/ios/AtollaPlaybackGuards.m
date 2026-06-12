#import "atolla/native/ios/AtollaPlaybackGuards.h"

BOOL AtollaIsItemAtEnd(double currentSeconds, double durationSeconds) {
    if (durationSeconds <= 0) return NO;
    // Within ~250ms of the end counts as ended.
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
