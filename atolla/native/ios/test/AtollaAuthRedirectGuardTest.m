#import <XCTest/XCTest.h>
#import "atolla/native/ios/AtollaAuthRedirectGuard.h"

@interface AtollaAuthRedirectGuardTest : XCTestCase
@end

@implementation AtollaAuthRedirectGuardTest

- (void)testSameOriginKeepsAuth {
    NSURL *server = [NSURL URLWithString:@"https://jellyfin.example.com/Items/1/Images/Primary"];
    NSURL *target = [NSURL URLWithString:@"https://jellyfin.example.com/Audio/2/stream"];
    XCTAssertTrue(AtollaRedirectKeepsAuth(server, target));
}

- (void)testDifferentHostStripsAuth {
    NSURL *server = [NSURL URLWithString:@"https://jellyfin.example.com/x"];
    NSURL *target = [NSURL URLWithString:@"https://cdn.attacker.example/x"];
    XCTAssertFalse(AtollaRedirectKeepsAuth(server, target));
}

- (void)testSchemeDowngradeStripsAuth {
    NSURL *server = [NSURL URLWithString:@"https://jellyfin.example.com/x"];
    NSURL *target = [NSURL URLWithString:@"http://jellyfin.example.com/x"];
    XCTAssertFalse(AtollaRedirectKeepsAuth(server, target));
}

- (void)testSchemeUpgradeSameHostKeepsAuth {
    NSURL *server = [NSURL URLWithString:@"http://jellyfin.example.com/x"];
    NSURL *target = [NSURL URLWithString:@"https://jellyfin.example.com/x"];
    XCTAssertTrue(AtollaRedirectKeepsAuth(server, target));
}

- (void)testDifferentPortSameHostKeepsAuth {
    NSURL *server = [NSURL URLWithString:@"https://jellyfin.example.com:8096/x"];
    NSURL *target = [NSURL URLWithString:@"https://jellyfin.example.com:443/x"];
    XCTAssertTrue(AtollaRedirectKeepsAuth(server, target));
}

- (void)testNilStripsAuth {
    NSURL *server = [NSURL URLWithString:@"https://jellyfin.example.com/x"];
    XCTAssertFalse(AtollaRedirectKeepsAuth(server, nil));
    XCTAssertFalse(AtollaRedirectKeepsAuth(nil, nil));
}

@end
