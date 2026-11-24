#pragma once
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface AtollaDownloadsFolder : NSObject
+ (BOOL)moveLegacy:(NSURL *)legacy to:(NSURL *)target;
@end

NS_ASSUME_NONNULL_END
