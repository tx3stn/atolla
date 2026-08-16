#pragma once
#import <Foundation/Foundation.h>

@interface AtollaPaletteExtractor : NSObject
// decode imageData (any format ImageIO can decode) and extract a colour palette.
// returns a JSON string with hex values for accent, surface, on_surface,
// muted_on_surface, or nil if the image couldn't be decoded
+ (nullable NSString *)extractPaletteFromData:(nonnull NSData *)imageData NS_SWIFT_NAME(extractPalette(from:));
@end
