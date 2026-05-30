#import "atolla/native/ios/AtollaPlaybackGuards.h"

BOOL AtollaIsItemAtEnd(double currentSeconds, double durationSeconds) {
    if (durationSeconds <= 0) return NO;
    // Within ~250ms of the end counts as ended.
    return currentSeconds >= durationSeconds - 0.25;
}
