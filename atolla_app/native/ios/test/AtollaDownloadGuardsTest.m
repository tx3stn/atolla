#import <XCTest/XCTest.h>
#import "atolla_app/native/ios/AtollaDownloadGuards.h"

@interface AtollaDownloadGuardsTest : XCTestCase
@end

@implementation AtollaDownloadGuardsTest

- (void)testRejectedTokenIsReportedBackToJS {
    XCTAssertEqualObjects(@"atolla:unauthorized", [AtollaDownloadGuards failureResultForStatus:401 carriedAuth:YES]);
}

- (void)testUnauthorizedWithoutTheTokenIsNotARejectedToken {
    XCTAssertEqualObjects(@"", [AtollaDownloadGuards failureResultForStatus:401 carriedAuth:NO]);
}

- (void)testForbiddenIsNotARejectedToken {
    XCTAssertEqualObjects(@"", [AtollaDownloadGuards failureResultForStatus:403 carriedAuth:YES]);
}

- (void)testMissingTrackIsNotARejectedToken {
    XCTAssertEqualObjects(@"", [AtollaDownloadGuards failureResultForStatus:404 carriedAuth:YES]);
}

- (void)testServerErrorIsNotARejectedToken {
    XCTAssertEqualObjects(@"", [AtollaDownloadGuards failureResultForStatus:500 carriedAuth:YES]);
}

- (void)testNoResponseIsNotARejectedToken {
    XCTAssertEqualObjects(@"", [AtollaDownloadGuards failureResultForStatus:0 carriedAuth:YES]);
}

@end
