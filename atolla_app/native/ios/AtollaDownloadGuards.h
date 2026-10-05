#pragma once
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

extern NSString *const AtollaDownloadUnauthorizedResult;

@interface AtollaDownloadGuards : NSObject
+ (NSString *)failureResultForStatus:(NSInteger)status carriedAuth:(BOOL)carriedAuth;
@end

NS_ASSUME_NONNULL_END
