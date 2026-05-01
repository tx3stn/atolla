#pragma once
#import <Foundation/Foundation.h>

@interface AtollaBlurProcessor : NSObject
// Decode imageData (JPEG or PNG), apply iterative bilinear blur via the shared
// Zig implementation, and re-encode as JPEG at quality 0.9.
// Returns nil if the image cannot be decoded or encoded.
+ (nullable NSData *)blurImageData:(nonnull NSData *)imageData NS_SWIFT_NAME(blur(imageData:));
@end
