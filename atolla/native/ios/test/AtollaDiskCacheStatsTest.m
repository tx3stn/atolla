#import <XCTest/XCTest.h>
#import "atolla/native/ios/AtollaDiskCacheStats.h"

@interface AtollaDiskCacheStatsTest : XCTestCase
@end

@implementation AtollaDiskCacheStatsTest {
    NSURL *_dir;
}

- (NSString *)hashOf:(unichar)c {
    return [@"" stringByPaddingToLength:64 withString:[NSString stringWithCharacters:&c length:1] startingAtIndex:0];
}

- (NSURL *)makeTempDir {
    NSURL *dir = [NSURL fileURLWithPath:[NSTemporaryDirectory()
        stringByAppendingPathComponent:[NSUUID UUID].UUIDString]];
    [NSFileManager.defaultManager createDirectoryAtURL:dir
                           withIntermediateDirectories:YES
                                            attributes:nil
                                                 error:nil];
    return dir;
}

- (void)writeFile:(NSString *)name size:(NSUInteger)size inDir:(NSURL *)dir {
    NSData *data = [NSMutableData dataWithLength:size];
    [data writeToURL:[dir URLByAppendingPathComponent:name] atomically:YES];
}

- (void)tearDown {
    if (_dir) [NSFileManager.defaultManager removeItemAtURL:_dir error:nil];
    [super tearDown];
}

- (void)testNilDirectoryYieldsAnEmptySnapshot {
    AtollaDiskStatsSnapshot *snapshot = [AtollaDiskCacheStats scanDirectory:nil];
    XCTAssertEqual(0, snapshot.count);
    XCTAssertEqual(0LL, snapshot.bytes);
    XCTAssertEqualObjects(@"{}", snapshot.categoryCountsJson);
}

- (void)testCountsEveryFileAndSumsTheirBytesInASinglePass {
    _dir = [self makeTempDir];
    [self writeFile:[@"album_art_" stringByAppendingString:[self hashOf:'a']] size:10 inDir:_dir];
    [self writeFile:[@"album_art_" stringByAppendingString:[self hashOf:'b']] size:20 inDir:_dir];
    [self writeFile:[@"artist_image_" stringByAppendingString:[self hashOf:'c']] size:30 inDir:_dir];

    AtollaDiskStatsSnapshot *snapshot = [AtollaDiskCacheStats scanDirectory:_dir];

    XCTAssertEqual(3, snapshot.count);
    XCTAssertEqual(60LL, snapshot.bytes);
}

- (void)testAggregatesCategoryCountsByFilenamePrefix {
    _dir = [self makeTempDir];
    [self writeFile:[@"album_art_" stringByAppendingString:[self hashOf:'a']] size:1 inDir:_dir];
    [self writeFile:[@"album_art_" stringByAppendingString:[self hashOf:'b']] size:1 inDir:_dir];
    [self writeFile:[@"artist_image_" stringByAppendingString:[self hashOf:'c']] size:1 inDir:_dir];

    AtollaDiskStatsSnapshot *snapshot = [AtollaDiskCacheStats scanDirectory:_dir];

    NSDictionary *parsed = [NSJSONSerialization
        JSONObjectWithData:[snapshot.categoryCountsJson dataUsingEncoding:NSUTF8StringEncoding]
                   options:0 error:nil];
    XCTAssertEqualObjects((@{@"album_art": @2, @"artist_image": @1}), parsed);
}

- (void)testMalformedFilenamesCountTowardTotalsButNotCategories {
    _dir = [self makeTempDir];
    [self writeFile:[@"album_art_" stringByAppendingString:[self hashOf:'a']] size:5 inDir:_dir];
    [self writeFile:@"short" size:7 inDir:_dir];

    AtollaDiskStatsSnapshot *snapshot = [AtollaDiskCacheStats scanDirectory:_dir];

    XCTAssertEqual(2, snapshot.count);
    XCTAssertEqual(12LL, snapshot.bytes);
    NSDictionary *parsed = [NSJSONSerialization
        JSONObjectWithData:[snapshot.categoryCountsJson dataUsingEncoding:NSUTF8StringEncoding]
                   options:0 error:nil];
    XCTAssertEqualObjects((@{@"album_art": @1}), parsed);
}

@end
