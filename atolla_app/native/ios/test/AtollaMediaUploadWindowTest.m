#import <XCTest/XCTest.h>
#import "atolla_app/native/ios/AtollaMediaUploadWindow.h"

@interface AtollaMediaUploadWindowTest : XCTestCase
@end

@implementation AtollaMediaUploadWindowTest

static NSArray *Tracks(NSArray<NSString *> *trackIds, BOOL sendFiles) {
    NSDictionary *downloaded = @{@"a": @"/downloads/a.flac"};
    NSDictionary *cached = @{@"a": @"/cache/a.flac", @"b": @"/cache/b.flac"};

    return AtollaMediaUploadTracks(
        trackIds,
        sendFiles,
        ^NSString *(NSString *trackId) { return downloaded[trackId]; },
        ^NSString *(NSString *trackId) { return cached[trackId]; });
}

- (void)testOfflineADownloadedTrackIsSentFromItsDownloadRatherThanTheCache {
    XCTAssertEqualObjects(Tracks(@[@"a"], YES), (@[@{@"id": @"a", @"path": @"/downloads/a.flac"}]));
}

- (void)testOfflineATrackThatIsNotDownloadedIsSentFromTheCache {
    XCTAssertEqualObjects(Tracks(@[@"b"], YES), (@[@{@"id": @"b", @"path": @"/cache/b.flac"}]));
}

- (void)testOfflineATrackThePhoneHasNoFileForGoesWithoutAPath {
    XCTAssertEqualObjects(Tracks(@[@"c"], YES), (@[@{@"id": @"c", @"path": [NSNull null]}]));
}

- (void)testOnlineNoTrackGetsAPath {
    XCTAssertEqualObjects(Tracks((@[@"a", @"b"]), NO),
                          (@[@{@"id": @"a", @"path": [NSNull null]}, @{@"id": @"b", @"path": [NSNull null]}]));
}

@end
