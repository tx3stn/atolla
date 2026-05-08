#pragma once
#import <Foundation/Foundation.h>

@interface AtollaPaletteExtractor : NSObject
// Decode imageData (any format supported by UIImage) and extract a colour palette.
// Returns a JSON string with hex values for primary, accent, surface, on_surface, muted_on_surface,
// or nil if the image could not be decoded.
+ (nullable NSString *)extractPaletteFromData:(nonnull NSData *)imageData NS_SWIFT_NAME(extractPalette(from:));
@end
