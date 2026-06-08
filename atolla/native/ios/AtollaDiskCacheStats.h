#pragma once
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

// Pure, framework-free disk-cache scanning logic. Extracted so it can be unit tested on the host
// without UIKit/Valdi, mirroring AtollaDiskCacheStats.kt on Android.

@interface AtollaDiskStatsSnapshot : NSObject
@property (nonatomic, readonly) NSInteger count;
@property (nonatomic, readonly) long long bytes;
@property (nonatomic, readonly, copy) NSString *categoryCountsJson;
- (instancetype)initWithCount:(NSInteger)count
                        bytes:(long long)bytes
           categoryCountsJson:(NSString *)categoryCountsJson;
@end

@interface AtollaDiskCacheStats : NSObject
// Single directory scan producing count, bytes and per-category counts together, replacing the
// three separate scans the individual getters incur.
+ (AtollaDiskStatsSnapshot *)scanDirectory:(nullable NSURL *)dir;
@end

NS_ASSUME_NONNULL_END
