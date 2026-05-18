#import <atollaTypes/atollaTypes.h>
#import <valdi_core/SCValdiModuleFactoryRegistry.h>
#import <Foundation/Foundation.h>

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
