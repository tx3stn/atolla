#import <XCTest/XCTest.h>
#import <CoreGraphics/CoreGraphics.h>
#import <ImageIO/ImageIO.h>
#import "atolla/native/ios/AtollaBoundedImageDecode.h"

@interface AtollaBoundedImageDecodeTest : XCTestCase
@end

@implementation AtollaBoundedImageDecodeTest

static NSData *PNGDataOfSize(size_t width, size_t height) {
    CGColorSpaceRef space = CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
    CGContextRef ctx = CGBitmapContextCreate(NULL, width, height, 8, 0, space,
        kCGImageAlphaPremultipliedLast | kCGBitmapByteOrder32Big);
    CGColorSpaceRelease(space);
    CGContextSetRGBFillColor(ctx, 0.2, 0.4, 0.6, 1.0);
    CGContextFillRect(ctx, CGRectMake(0, 0, width, height));
    CGImageRef image = CGBitmapContextCreateImage(ctx);
    CGContextRelease(ctx);

    NSMutableData *data = [NSMutableData data];
    CGImageDestinationRef dest = CGImageDestinationCreateWithData(
        (__bridge CFMutableDataRef)data, (CFStringRef)@"public.png", 1, NULL);
    CGImageDestinationAddImage(dest, image, NULL);
    CGImageDestinationFinalize(dest);
    CFRelease(dest);
    CGImageRelease(image);
    return data;
}

- (void)testLargeImageIsDownsampledWithinCap {
    NSData *png = PNGDataOfSize(2000, 1000);
    CGImageRef decoded = AtollaCreateBoundedCGImage(png, 512);
    XCTAssertTrue(decoded != NULL);
    XCTAssertLessThanOrEqual(CGImageGetWidth(decoded), (size_t)512);
    XCTAssertLessThanOrEqual(CGImageGetHeight(decoded), (size_t)512);
    XCTAssertLessThan(CGImageGetWidth(decoded), (size_t)2000);
    CGImageRelease(decoded);
}

- (void)testSmallImageIsNotUpscaled {
    NSData *png = PNGDataOfSize(64, 64);
    CGImageRef decoded = AtollaCreateBoundedCGImage(png, 512);
    XCTAssertTrue(decoded != NULL);
    XCTAssertEqual(CGImageGetWidth(decoded), (size_t)64);
    XCTAssertEqual(CGImageGetHeight(decoded), (size_t)64);
    CGImageRelease(decoded);
}

- (void)testGarbageDataReturnsNull {
    NSData *garbage = [@"not an image" dataUsingEncoding:NSUTF8StringEncoding];
    CGImageRef decoded = AtollaCreateBoundedCGImage(garbage, 512);
    XCTAssertTrue(decoded == NULL);
}

@end
