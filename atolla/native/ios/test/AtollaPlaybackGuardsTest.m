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

@end
