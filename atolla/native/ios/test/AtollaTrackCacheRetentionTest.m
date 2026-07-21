#import <XCTest/XCTest.h>
#import "atolla/native/ios/AtollaTrackCacheRetention.h"

@interface AtollaTrackCacheRetentionTest : XCTestCase
@end

@implementation AtollaTrackCacheRetentionTest

static NSDictionary *Entry(NSString *name, double mtime) {
    return @{@"name": name, @"mtime": @(mtime)};
}

- (void)testFileIsRetainedWhenAKeyMatchesItsNamePrefix {
    XCTAssertTrue(AtollaTrackCacheIsRetained(@"track-7.mp3", [NSSet setWithObject:@"track-7"]));
}

- (void)testKeyDoesNotMatchADifferentlyNamedFileSharingAPrefix {
    XCTAssertFalse(AtollaTrackCacheIsRetained(@"track-70.mp3", [NSSet setWithObject:@"track-7"]));
}

- (void)testNothingEvictedWhenAtOrBelowMax {
    NSArray *files = @[Entry(@"a.mp3", 1), Entry(@"b.mp3", 2)];
    XCTAssertEqualObjects(@[], AtollaTrackCacheSelectPruneVictims(files, [NSSet set], 2));
}

- (void)testEvictsOldestNonRetainedFirst {
    NSArray *files = @[Entry(@"old.mp3", 1), Entry(@"mid.mp3", 2), Entry(@"new.mp3", 3)];
    XCTAssertEqualObjects(@[@"old.mp3"], AtollaTrackCacheSelectPruneVictims(files, [NSSet set], 2));
}

- (void)testNeverEvictsRetainedFilesEvenWhenOldest {
    NSArray *files = @[Entry(@"retained.mp3", 1), Entry(@"mid.mp3", 2), Entry(@"new.mp3", 3)];
    XCTAssertEqualObjects(@[@"mid.mp3"],
                          AtollaTrackCacheSelectPruneVictims(files, [NSSet setWithObject:@"retained"], 2));
}

- (void)testHoldsAboveMaxWhenRetainedAloneExceedsIt {
    NSArray *files = @[Entry(@"r1.mp3", 1), Entry(@"r2.mp3", 2), Entry(@"r3.mp3", 3)];
    NSSet *retained = [NSSet setWithArray:@[@"r1", @"r2", @"r3"]];
    XCTAssertEqualObjects(@[], AtollaTrackCacheSelectPruneVictims(files, retained, 1));
}

- (void)testEvictsOnlyOverflowOldestFirstAmongNonRetained {
    NSArray *files = @[
        Entry(@"retained.mp3", 1),
        Entry(@"old.mp3", 2),
        Entry(@"mid.mp3", 3),
        Entry(@"new.mp3", 4),
    ];
    NSArray *expected = @[@"old.mp3", @"mid.mp3"];
    XCTAssertEqualObjects(expected,
                          AtollaTrackCacheSelectPruneVictims(files, [NSSet setWithObject:@"retained"], 2));
}

- (void)testBreaksModificationTiesByNameForDeterminism {
    NSArray *files = @[Entry(@"b.mp3", 5), Entry(@"a.mp3", 5), Entry(@"c.mp3", 9)];
    XCTAssertEqualObjects(@[@"a.mp3"], AtollaTrackCacheSelectPruneVictims(files, [NSSet set], 2));
}

- (void)testNonPositiveMaxEvictsNothing {
    NSArray *files = @[Entry(@"a.mp3", 1), Entry(@"b.mp3", 2)];
    XCTAssertEqualObjects(@[], AtollaTrackCacheSelectPruneVictims(files, [NSSet set], 0));
}

@end
