#import <XCTest/XCTest.h>
#import "atolla_app/native/ios/AtollaDownloadGuards.h"

@interface AtollaDownloadGuardsTest : XCTestCase
@end

@implementation AtollaDownloadGuardsTest

- (void)testRejectedTokenIsReportedBackToJS {
    XCTAssertEqualObjects(@"atolla:unauthorized", [AtollaDownloadGuards failureResultForStatus:401]);
}

- (void)testForbiddenIsNotARejectedToken {
    XCTAssertEqualObjects(@"", [AtollaDownloadGuards failureResultForStatus:403]);
}

- (void)testMissingTrackIsNotARejectedToken {
    XCTAssertEqualObjects(@"", [AtollaDownloadGuards failureResultForStatus:404]);
}

- (void)testServerErrorIsNotARejectedToken {
    XCTAssertEqualObjects(@"", [AtollaDownloadGuards failureResultForStatus:500]);
}

- (void)testNoResponseIsNotARejectedToken {
    XCTAssertEqualObjects(@"", [AtollaDownloadGuards failureResultForStatus:0]);
}

@end
