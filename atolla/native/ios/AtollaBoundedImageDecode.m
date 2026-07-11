#import "atolla/native/ios/AtollaBoundedImageDecode.h"
#import <ImageIO/ImageIO.h>

CGImageRef _Nullable AtollaCreateBoundedCGImage(NSData *data, size_t maxPixelSize) {
    CGImageSourceRef source = CGImageSourceCreateWithData((__bridge CFDataRef)data, NULL);
    if (!source) {
        return NULL;
    }

    NSDictionary *options = @{
        (id)kCGImageSourceCreateThumbnailFromImageAlways : @YES,
        (id)kCGImageSourceThumbnailMaxPixelSize : @(maxPixelSize),
    };
    CGImageRef image =
        CGImageSourceCreateThumbnailAtIndex(source, 0, (__bridge CFDictionaryRef)options);
    CFRelease(source);
    return image;
}
