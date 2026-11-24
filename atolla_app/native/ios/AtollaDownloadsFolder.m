#import "atolla_app/native/ios/AtollaDownloadsFolder.h"

@implementation AtollaDownloadsFolder

+ (BOOL)moveLegacy:(NSURL *)legacy to:(NSURL *)target {
    NSFileManager *fileManager = NSFileManager.defaultManager;
    if (![fileManager fileExistsAtPath:legacy.path]) return YES;
    if ([fileManager fileExistsAtPath:target.path]) return NO;
    [fileManager createDirectoryAtURL:target.URLByDeletingLastPathComponent
          withIntermediateDirectories:YES
                           attributes:nil
                                error:nil];
    return [fileManager moveItemAtURL:legacy toURL:target error:nil];
}

@end
