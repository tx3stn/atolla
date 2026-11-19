#import <XCTest/XCTest.h>
#import "atolla_app/native/ios/AtollaAuthRedirectGuard.h"

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

- (void)testImageOnTheServerIsSameOrigin {
    NSURL *server = [NSURL URLWithString:@"https://jellyfin.example.com:8096"];
    NSURL *image = [NSURL URLWithString:@"https://jellyfin.example.com:8096/Items/1/Images/Primary"];
    XCTAssertTrue(AtollaSameOrigin(server, image));
}

- (void)testImageOnAnotherHostIsNotSameOrigin {
    NSURL *server = [NSURL URLWithString:@"https://jellyfin.example.com:8096"];
    NSURL *image = [NSURL URLWithString:@"https://coverartarchive.org/release-group/1/front"];
    XCTAssertFalse(AtollaSameOrigin(server, image));
}

- (void)testImageOnAnotherPortOfTheSameHostIsNotSameOrigin {
    NSURL *server = [NSURL URLWithString:@"https://jellyfin.example.com:8096"];
    NSURL *image = [NSURL URLWithString:@"https://jellyfin.example.com:8686/MediaCover/1/cover.jpg"];
    XCTAssertFalse(AtollaSameOrigin(server, image));
}

- (void)testImageOverHttpFromAnHttpsServerIsNotSameOrigin {
    NSURL *server = [NSURL URLWithString:@"https://jellyfin.example.com:8096"];
    NSURL *image = [NSURL URLWithString:@"http://jellyfin.example.com:8096/Items/1/Images/Primary"];
    XCTAssertFalse(AtollaSameOrigin(server, image));
}

- (void)testDefaultPortMatchesTheSamePortWrittenOut {
    NSURL *server = [NSURL URLWithString:@"https://jellyfin.example.com"];
    NSURL *image = [NSURL URLWithString:@"https://jellyfin.example.com:443/Items/1/Images/Primary"];
    XCTAssertTrue(AtollaSameOrigin(server, image));
}

- (void)testHostThatDiffersOnlyInCaseIsSameOrigin {
    NSURL *server = [NSURL URLWithString:@"https://jellyfin.example.com:8096"];
    NSURL *image = [NSURL URLWithString:@"https://Jellyfin.Example.com:8096/Items/1/Images/Primary"];
    XCTAssertTrue(AtollaSameOrigin(server, image));
}

- (void)testNilIsNotSameOrigin {
    NSURL *server = [NSURL URLWithString:@"https://jellyfin.example.com"];
    XCTAssertFalse(AtollaSameOrigin(server, nil));
    XCTAssertFalse(AtollaSameOrigin(nil, server));
}

@end
