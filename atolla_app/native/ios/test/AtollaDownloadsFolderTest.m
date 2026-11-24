#import <XCTest/XCTest.h>
#import "atolla_app/native/ios/AtollaDownloadsFolder.h"

@interface AtollaDownloadsFolderTest : XCTestCase
@end

@implementation AtollaDownloadsFolderTest {
    NSURL *_root;
    NSURL *_legacy;
    NSURL *_target;
}

- (void)setUp {
    [super setUp];
    _root = [NSURL fileURLWithPath:[NSTemporaryDirectory()
        stringByAppendingPathComponent:[NSUUID UUID].UUIDString]];
    _legacy = [_root URLByAppendingPathComponent:@"atolla-downloaded-track-cache" isDirectory:YES];
    _target = [_root URLByAppendingPathComponent:@"atolla/downloads" isDirectory:YES];
}

- (void)tearDown {
    [NSFileManager.defaultManager removeItemAtURL:_root error:nil];
    [super tearDown];
}

- (void)writeText:(NSString *)text toFile:(NSString *)name inDir:(NSURL *)dir {
    [NSFileManager.defaultManager createDirectoryAtURL:dir
                           withIntermediateDirectories:YES
                                            attributes:nil
                                                 error:nil];
    [text writeToURL:[dir URLByAppendingPathComponent:name]
          atomically:YES
            encoding:NSUTF8StringEncoding
               error:nil];
}

- (NSString *)readFile:(NSString *)name inDir:(NSURL *)dir {
    return [NSString stringWithContentsOfURL:[dir URLByAppendingPathComponent:name]
                                    encoding:NSUTF8StringEncoding
                                       error:nil];
}

- (void)testMovesTheLegacyFolderAndItsFilesIntoPlace {
    [self writeText:@"audio" toFile:@"track-1.flac" inDir:_legacy];

    XCTAssertTrue([AtollaDownloadsFolder moveLegacy:_legacy to:_target]);

    XCTAssertFalse([NSFileManager.defaultManager fileExistsAtPath:_legacy.path]);
    XCTAssertEqualObjects(@"audio", [self readFile:@"track-1.flac" inDir:_target]);
}

- (void)testDoesNothingWhenThereIsNoLegacyFolder {
    XCTAssertTrue([AtollaDownloadsFolder moveLegacy:_legacy to:_target]);

    XCTAssertFalse([NSFileManager.defaultManager fileExistsAtPath:_target.path]);
}

- (void)testKeepsBothFoldersAndReportsTheLegacyOneWhenTheNewFolderExists {
    [self writeText:@"old" toFile:@"track-1.flac" inDir:_legacy];
    [self writeText:@"new" toFile:@"track-2.flac" inDir:_target];

    XCTAssertFalse([AtollaDownloadsFolder moveLegacy:_legacy to:_target]);

    XCTAssertEqualObjects(@"old", [self readFile:@"track-1.flac" inDir:_legacy]);
    NSArray *targetFiles = [NSFileManager.defaultManager contentsOfDirectoryAtPath:_target.path
                                                                             error:nil];
    XCTAssertEqualObjects(@[@"track-2.flac"], targetFiles);
}

@end
