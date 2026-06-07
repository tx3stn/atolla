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
    // Boundary is duration - 0.25s.
    XCTAssertTrue(AtollaIsItemAtEnd(179.80, 180.0));
    XCTAssertFalse(AtollaIsItemAtEnd(179.70, 180.0));
}

- (void)testNonPositiveDurationIsNeverAtEnd {
    XCTAssertFalse(AtollaIsItemAtEnd(0.0, 0.0));
    XCTAssertFalse(AtollaIsItemAtEnd(5.0, 0.0));
    XCTAssertFalse(AtollaIsItemAtEnd(5.0, -1.0));
}

- (void)testFirstUpcomingEntryFollowsTheCurrentItem {
    XCTAssertEqual(0, AtollaNextUpcomingIndex(@[ @"b", @"c" ], @"a", @"a"));
}

- (void)testSuccessorOfTheLastQueuedEntryIsTheNextOne {
    XCTAssertEqual(1, AtollaNextUpcomingIndex(@[ @"b", @"c", @"d" ], @"b", @"a"));
}

- (void)testNoSuccessorWhenTheBufferIsExhausted {
    XCTAssertEqual(-1, AtollaNextUpcomingIndex(@[ @"b", @"c" ], @"c", @"a"));
}

- (void)testNoSuccessorWhenTheLastQueuedItemIsUnknown {
    XCTAssertEqual(-1, AtollaNextUpcomingIndex(@[ @"b", @"c" ], @"x", @"a"));
}

- (void)testNoSuccessorForEmptyBufferOrBlankLastItem {
    XCTAssertEqual(-1, AtollaNextUpcomingIndex(@[], @"a", @"a"));
    XCTAssertEqual(-1, AtollaNextUpcomingIndex(@[ @"b" ], @"", @"a"));
}

- (void)testTrackLoopBufferOfRepeatedKeysKeepsYieldingTheRepeat {
    XCTAssertEqual(1, AtollaNextUpcomingIndex(@[ @"a", @"a", @"a" ], @"a", @"a"));
}

@end
