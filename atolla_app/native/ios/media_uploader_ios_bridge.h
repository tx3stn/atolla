#pragma once
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface AtollaMediaUploader : NSObject
+ (void)setTargetHost:(NSString *)host port:(uint16_t)port token:(NSString *)token;
+ (void)setWindowJson:(NSString *)json;
@end

NS_ASSUME_NONNULL_END
