#import <atollaTypes/atollaTypes.h>
#import <valdi_core/SCValdiModuleFactoryRegistry.h>
#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>

static NSString * const kLogFileName = @"atolla-debug.log";
static NSString * const kLogDirName = @"atolla-debug";
static const long long kMaxLogBytes = 2 * 1024 * 1024;

static NSString *resolveLogFilePath(void) {
    NSString *tempDir = NSTemporaryDirectory();
    NSString *logDir = [tempDir stringByAppendingPathComponent:kLogDirName];
    NSError *error = nil;
    [[NSFileManager defaultManager] createDirectoryAtPath:logDir
                              withIntermediateDirectories:YES
                                               attributes:nil
                                                    error:&error];
    return [logDir stringByAppendingPathComponent:kLogFileName];
}

static void rotateLogIfNeeded(NSString *path) {
    NSDictionary *attrs = [[NSFileManager defaultManager] attributesOfItemAtPath:path error:nil];
    long long size = [attrs[NSFileSize] longLongValue];
    if (size < kMaxLogBytes) return;
    NSString *backup = [path stringByAppendingString:@".bak"];
    [[NSFileManager defaultManager] removeItemAtPath:backup error:nil];
    [[NSFileManager defaultManager] moveItemAtPath:path toPath:backup error:nil];
}

static NSString *safeFileName(NSString *fileName) {
    NSString *name = fileName.lastPathComponent;
    return name.length > 0 ? name : @"atolla-export.txt";
}

static NSString *writeTempArtifact(NSString *fileName, NSString *contents) {
    NSString *path = [NSTemporaryDirectory() stringByAppendingPathComponent:safeFileName(fileName)];
    NSError *error = nil;
    [contents writeToFile:path atomically:YES encoding:NSUTF8StringEncoding error:&error];
    return error ? nil : path;
}

static UIViewController *topViewController(void) {
    UIWindow *keyWindow = nil;
    for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
        if (![scene isKindOfClass:[UIWindowScene class]]) continue;
        UIWindowScene *windowScene = (UIWindowScene *)scene;
        for (UIWindow *window in windowScene.windows) {
            if (window.isKeyWindow) { keyWindow = window; break; }
        }
        if (!keyWindow) { keyWindow = windowScene.windows.firstObject; }
        if (keyWindow) break;
    }
    UIViewController *vc = keyWindow.rootViewController;
    while (vc.presentedViewController) { vc = vc.presentedViewController; }
    return vc;
}

static void presentShareForPath(NSString *path) {
    if (path.length == 0) return;
    NSURL *url = [NSURL fileURLWithPath:path];
    dispatch_async(dispatch_get_main_queue(), ^{
        UIViewController *top = topViewController();
        if (!top) return;
        UIActivityViewController *avc =
            [[UIActivityViewController alloc] initWithActivityItems:@[url] applicationActivities:nil];
        avc.popoverPresentationController.sourceView = top.view;
        avc.popoverPresentationController.sourceRect =
            CGRectMake(CGRectGetMidX(top.view.bounds), CGRectGetMidY(top.view.bounds), 1, 1);
        avc.popoverPresentationController.permittedArrowDirections = 0;
        [top presentViewController:avc animated:YES completion:nil];
    });
}

@interface AtollaDebugLoggerNativeModuleImpl : NSObject <atollaDebugLoggerNativeModule>
@end

@implementation AtollaDebugLoggerNativeModuleImpl

- (NSString * _Nonnull)getAtollaDebugLogFilePath {
    return resolveLogFilePath();
}

- (void)writeAtollaDebugLogWithEntry:(NSString * _Nonnull)entry {
    NSString *path = resolveLogFilePath();
    rotateLogIfNeeded(path);
    NSString *line = [entry stringByAppendingString:@"\n"];
    NSData *data = [line dataUsingEncoding:NSUTF8StringEncoding];
    if (!data) return;
    if (![[NSFileManager defaultManager] fileExistsAtPath:path]) {
        [[NSFileManager defaultManager] createFileAtPath:path contents:data attributes:nil];
        return;
    }
    NSFileHandle *handle = [NSFileHandle fileHandleForWritingAtPath:path];
    if (!handle) return;
    [handle seekToEndOfFile];
    [handle writeData:data];
    [handle closeFile];
}

- (void)clearAtollaDebugLog {
    NSString *path = resolveLogFilePath();
    [@"" writeToFile:path atomically:YES encoding:NSUTF8StringEncoding error:nil];
}

- (NSString * _Nonnull)exportAtollaDebugLog {
    NSString *src = resolveLogFilePath();
    if (![[NSFileManager defaultManager] fileExistsAtPath:src]) return @"";
    NSArray *docDirs = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES);
    NSString *docDir = [docDirs firstObject];
    if (!docDir) return @"";
    NSString *dest = [docDir stringByAppendingPathComponent:kLogFileName];
    NSError *error = nil;
    [[NSFileManager defaultManager] removeItemAtPath:dest error:nil];
    [[NSFileManager defaultManager] copyItemAtPath:src toPath:dest error:&error];
    return error ? @"" : dest;
}

- (void)shareAtollaDebugLog {
    presentShareForPath(resolveLogFilePath());
}

- (NSString * _Nonnull)exportAtollaTextFileWithFileName:(NSString * _Nonnull)fileName
                                              contents:(NSString * _Nonnull)contents {
    NSArray *docDirs = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES);
    NSString *docDir = [docDirs firstObject];
    if (!docDir) return @"";
    NSString *dest = [docDir stringByAppendingPathComponent:safeFileName(fileName)];
    NSError *error = nil;
    [contents writeToFile:dest atomically:YES encoding:NSUTF8StringEncoding error:&error];
    return error ? @"" : dest;
}

- (void)shareAtollaTextFileWithFileName:(NSString * _Nonnull)fileName
                               contents:(NSString * _Nonnull)contents {
    presentShareForPath(writeTempArtifact(fileName, contents));
}

@end


// MARK: - Module Factory

@interface AtollaDebugLoggerNativeModuleFactoryImpl : atollaDebugLoggerNativeModuleFactory
@end

@implementation AtollaDebugLoggerNativeModuleFactoryImpl

VALDI_REGISTER_MODULE()

- (id<atollaDebugLoggerNativeModule> _Nonnull)onLoadModule {
    return [[AtollaDebugLoggerNativeModuleImpl alloc] init];
}

@end
