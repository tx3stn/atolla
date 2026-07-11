#pragma once
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

BOOL AtollaRedirectKeepsAuth(NSURL *_Nullable server, NSURL *_Nullable target);

@interface AtollaAuthRedirectGuard : NSObject <NSURLSessionTaskDelegate>
+ (NSURLSession *)sharedDefaultSession;
@end

NS_ASSUME_NONNULL_END
