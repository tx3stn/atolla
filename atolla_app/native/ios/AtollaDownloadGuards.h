#pragma once
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

extern NSString *const AtollaDownloadUnauthorizedResult;

@interface AtollaDownloadGuards : NSObject
+ (NSString *)failureResultForStatus:(NSInteger)status;
@end

NS_ASSUME_NONNULL_END
