#pragma once
#import <Foundation/Foundation.h>

@interface AtollaBlurProcessor : NSObject
// decode imageData (JPEG or PNG), apply iterative bilinear blur via the shared Zig
// implementation, and re-encode as JPEG at quality 0.9. returns nil if it can't be decoded/encoded
+ (nullable NSData *)blurImageData:(nonnull NSData *)imageData NS_SWIFT_NAME(blur(imageData:));
@end
