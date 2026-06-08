#import "atolla/native/ios/AtollaDiskCacheStats.h"

@implementation AtollaDiskStatsSnapshot
- (instancetype)initWithCount:(NSInteger)count
                        bytes:(long long)bytes
           categoryCountsJson:(NSString *)categoryCountsJson {
    self = [super init];
    if (self) {
        _count = count;
        _bytes = bytes;
        _categoryCountsJson = [categoryCountsJson copy];
    }
    return self;
}
@end

@implementation AtollaDiskCacheStats

+ (AtollaDiskStatsSnapshot *)scanDirectory:(NSURL *)dir {
    NSInteger count = 0;
    long long bytes = 0;
    NSMutableDictionary<NSString *, NSNumber *> *counts = [NSMutableDictionary dictionary];
    if (dir) {
        NSArray<NSURL *> *files = [NSFileManager.defaultManager
            contentsOfDirectoryAtURL:dir
            includingPropertiesForKeys:@[NSURLFileSizeKey] options:0 error:nil];
        for (NSURL *file in files) {
            NSNumber *size = nil;
            [file getResourceValue:&size forKey:NSURLFileSizeKey error:nil];
            count += 1;
            bytes += size.longLongValue;
            NSString *name = file.lastPathComponent;
            // Filename format: {category}_{sha256_64_hex}. SHA-256 is always 64 hex chars, so strip
            // the trailing 65 chars (underscore + hash); anything left is the category.
            if (name.length < 66) continue;
            NSString *category = [name substringToIndex:name.length - 65];
            if (category.length > 0) counts[category] = @(counts[category].intValue + 1);
        }
    }
    return [[AtollaDiskStatsSnapshot alloc] initWithCount:count
                                                    bytes:bytes
                                       categoryCountsJson:[self jsonForCounts:counts]];
}

+ (NSString *)jsonForCounts:(NSDictionary<NSString *, NSNumber *> *)counts {
    NSMutableString *json = [NSMutableString stringWithString:@"{"];
    __block BOOL first = YES;
    [counts enumerateKeysAndObjectsUsingBlock:^(NSString *k, NSNumber *v, BOOL *stop) {
        if (!first) [json appendString:@","];
        [json appendFormat:@"\"%@\":%@", k, v];
        first = NO;
    }];
    [json appendString:@"}"];
    return json;
}

@end
