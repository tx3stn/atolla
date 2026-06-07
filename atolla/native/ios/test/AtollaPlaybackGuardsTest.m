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

@end
