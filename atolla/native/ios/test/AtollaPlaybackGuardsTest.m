#import <XCTest/XCTest.h>
#import "atolla/native/ios/AtollaPlaybackGuards.h"

@interface AtollaPlaybackGuardsTest : XCTestCase
@end

@implementation AtollaPlaybackGuardsTest

- (void)testItemPastTheEndIsAtEnd {
    XCTAssertTrue(AtollaIsItemAtEnd(180.0, 180.0));
    XCTAssertTrue(AtollaIsItemAtEnd(181.0, 180.0));
}

- (void)testItemComfortablyBeforeTheEndIsNotAtEnd {
    XCTAssertFalse(AtollaIsItemAtEnd(10.0, 180.0));
    XCTAssertFalse(AtollaIsItemAtEnd(0.0, 180.0));
}

- (void)testWithinTheQuarterSecondBoundaryCountsAsEnded {
    // boundary is duration - 0.25s
    XCTAssertTrue(AtollaIsItemAtEnd(179.80, 180.0));
    XCTAssertFalse(AtollaIsItemAtEnd(179.70, 180.0));
}

- (void)testNonPositiveDurationIsNeverAtEnd {
    XCTAssertFalse(AtollaIsItemAtEnd(0.0, 0.0));
    XCTAssertFalse(AtollaIsItemAtEnd(5.0, 0.0));
    XCTAssertFalse(AtollaIsItemAtEnd(5.0, -1.0));
}

- (void)testAnchorMatchesTheHintedIndexWhenTheKeyLinesUp {
    XCTAssertEqual(2, AtollaResolveWindowAnchor(@[ @"a", @"b", @"c", @"d" ], 2, @"c"));
}

- (void)testAnchorIsCorrectedToTheNearestOccurrenceWhenTheHintIsStale {
    XCTAssertEqual(3, AtollaResolveWindowAnchor(@[ @"a", @"b", @"c", @"d" ], 2, @"d"));
}

- (void)testDuplicateKeysResolveToTheOccurrenceNearestTheHint {
    XCTAssertEqual(3, AtollaResolveWindowAnchor(@[ @"a", @"b", @"a", @"a", @"b" ], 3, @"a"));
    XCTAssertEqual(0, AtollaResolveWindowAnchor(@[ @"a", @"b", @"a", @"a", @"b" ], 0, @"a"));
}

- (void)testNoAnchorForUnknownKeyOrEmptyWindow {
    XCTAssertEqual(-1, AtollaResolveWindowAnchor(@[ @"a", @"b" ], 0, @"x"));
    XCTAssertEqual(-1, AtollaResolveWindowAnchor(@[], 0, @"a"));
}

- (void)testOutOfRangeHintsAreTolerated {
    XCTAssertEqual(1, AtollaResolveWindowAnchor(@[ @"a", @"b" ], 99, @"b"));
    XCTAssertEqual(0, AtollaResolveWindowAnchor(@[ @"a", @"b" ], -5, @"a"));
}

- (void)testSuppressesStaleWakeRaceRebuildThatWouldPullAPlayingEngineBackToAnEarlierTrack {
    XCTAssertTrue(AtollaShouldSuppressBackwardRebuild(YES, 1, 3, NO));
}

- (void)testSuppressesStaleWakeRaceRebuildWhenTheEngineIsOnTheSameWindowSlot {
    XCTAssertTrue(AtollaShouldSuppressBackwardRebuild(YES, 2, 2, NO));
}

- (void)testAllowsRebuildThatMovesAPlayingEngineForward {
    XCTAssertFalse(AtollaShouldSuppressBackwardRebuild(YES, 3, 1, NO));
}

- (void)testNeverSuppressesWhenTheEngineIsNotPlaying {
    XCTAssertFalse(AtollaShouldSuppressBackwardRebuild(NO, 1, 3, NO));
}

- (void)testNeverSuppressesWhenAnAnchorIsUnknown {
    XCTAssertFalse(AtollaShouldSuppressBackwardRebuild(YES, -1, 3, NO));
    XCTAssertFalse(AtollaShouldSuppressBackwardRebuild(YES, 1, -1, NO));
}

- (void)testHonorsADeliberateInAppBackwardNavigationWhilePlaying {
    // previous button / back-to tap: the same shape the wake-race guard would otherwise
    // suppress (playing, current ahead of requested), but the caller signalled intent.
    XCTAssertFalse(AtollaShouldSuppressBackwardRebuild(YES, 1, 3, YES));
}

- (void)testHonorsADeliberateNavigationToTheSameWindowSlotWhilePlaying {
    XCTAssertFalse(AtollaShouldSuppressBackwardRebuild(YES, 2, 2, YES));
}

- (void)testDefersLookaheadForAnHttpsStreamSource {
    XCTAssertTrue(AtollaShouldDeferLookaheadForSource(@"https://server/Audio/123/stream.mp3"));
}

- (void)testDefersLookaheadForAnHttpStreamSource {
    XCTAssertTrue(AtollaShouldDeferLookaheadForSource(@"http://server/Audio/123/stream.mp3"));
}

- (void)testDefersLookaheadForAFileSource {
    XCTAssertTrue(AtollaShouldDeferLookaheadForSource(@"file:///data/tracks/123.mp3"));
}

- (void)testDefersLookaheadForABareLocalPathSource {
    XCTAssertTrue(AtollaShouldDeferLookaheadForSource(@"/data/tracks/123.mp3"));
}

- (void)testKeepsLookaheadForABlankSource {
    XCTAssertFalse(AtollaShouldDeferLookaheadForSource(@""));
}

- (void)testCurrentItemMatchesOnTrackIdEvenWhenTheSourceUrlChanged {
    // stream URL replaced by its cached file for the same track: still the same item, no rebuild
    XCTAssertTrue(AtollaCurrentItemMatches(@"track-1", @"track-1",
                                           @"https://server/Audio/track-1/stream.mp3",
                                           @"file:///data/tracks/track-1.mp3"));
}

- (void)testCurrentItemDoesNotMatchWhenTheTrackIdDiffers {
    XCTAssertFalse(AtollaCurrentItemMatches(@"track-1", @"track-2",
                                            @"https://server/Audio/track-1/stream.mp3",
                                            @"https://server/Audio/track-1/stream.mp3"));
}

- (void)testCurrentItemFallsBackToSourceUrlWhenTheLoadedIdIsUnknown {
    XCTAssertTrue(AtollaCurrentItemMatches(@"", @"track-1", @"file:///a.mp3", @"file:///a.mp3"));
    XCTAssertFalse(AtollaCurrentItemMatches(@"", @"track-1", @"file:///a.mp3", @"file:///b.mp3"));
}

- (void)testCurrentItemFallsBackToSourceUrlWhenTheRequestedIdIsUnknown {
    XCTAssertTrue(AtollaCurrentItemMatches(@"track-1", @"", @"file:///a.mp3", @"file:///a.mp3"));
    XCTAssertFalse(AtollaCurrentItemMatches(@"track-1", @"", @"file:///a.mp3", @"file:///b.mp3"));
}

@end
