#import "waveform_ios_bridge.h"
#import <AVFoundation/AVFoundation.h>
#import <UIKit/UIKit.h>
#include <math.h>
#include <stdlib.h>
#include <string.h>
#include "waveform_generator.h"

static const NSInteger kDefaultWaveformWidth = 500;
static const NSInteger kDefaultWaveformHeight = 100;

enum {
    kWaveformControlPoints = 300,
};

@implementation AtollaWaveformGenerator

+ (nullable NSData *)extractAmpsFromAudioPath:(nonnull NSString *)audioPath {
    NSURL *url = ([audioPath hasPrefix:@"http://"] || [audioPath hasPrefix:@"https://"])
        ? [NSURL URLWithString:audioPath]
        : [NSURL fileURLWithPath:audioPath];
    AVAsset *asset = [AVAsset assetWithURL:url];
    NSArray<AVAssetTrack *> *tracks = [asset tracksWithMediaType:AVMediaTypeAudio];
    if (tracks.count == 0) return nil;

    // 8000 Hz is the minimum AVFoundation accepts and still far exceeds what's
    // needed for a 100-point amplitude envelope.
    NSDictionary *outputSettings = @{
        AVFormatIDKey:               @(kAudioFormatLinearPCM),
        AVLinearPCMBitDepthKey:      @32,
        AVLinearPCMIsFloatKey:       @YES,
        AVLinearPCMIsBigEndianKey:   @NO,
        AVLinearPCMIsNonInterleaved: @NO,
        AVSampleRateKey:             @8000.0,
    };

    NSError *error = nil;
    AVAssetReader *reader = [AVAssetReader assetReaderWithAsset:asset error:&error];
    if (!reader || error) return nil;

    AVAssetReaderTrackOutput *readerOutput =
        [AVAssetReaderTrackOutput assetReaderTrackOutputWithTrack:tracks[0]
                                                   outputSettings:outputSettings];
    readerOutput.alwaysCopiesSampleData = NO;
    [reader addOutput:readerOutput];

    if (![reader startReading]) return nil;

    const CMTime duration    = asset.duration;
    const Float64 sampleRate = 8000.0;
    const long long totalFrames = (duration.timescale > 0)
        ? (long long)(CMTimeGetSeconds(duration) * sampleRate + 0.5)
        : 0;

    double sumSq[kWaveformControlPoints] = {0};
    int    counts[kWaveformControlPoints] = {0};
    long long decodedFrames = 0;
    uint32_t channelCount   = 0;

    while (reader.status == AVAssetReaderStatusReading) {
        CMSampleBufferRef buffer = [readerOutput copyNextSampleBuffer];
        if (!buffer) break;

        if (channelCount == 0) {
            CMFormatDescriptionRef fmt = CMSampleBufferGetFormatDescription(buffer);
            if (fmt) {
                const AudioStreamBasicDescription *asbd =
                    CMAudioFormatDescriptionGetStreamBasicDescription(fmt);
                if (asbd) channelCount = (uint32_t)asbd->mChannelsPerFrame;
            }
        }

        CMBlockBufferRef block = CMSampleBufferGetDataBuffer(buffer);
        if (block && channelCount > 0) {
            size_t dataLength = CMBlockBufferGetDataLength(block);
            char *dataPtr = NULL;
            size_t lengthAtPtr = 0;
            if (CMBlockBufferGetDataPointer(block, 0, &lengthAtPtr, &dataLength, &dataPtr) == kCMBlockBufferNoErr && dataPtr) {
                const float *samples    = (const float *)dataPtr;
                const long long nFrames = (long long)(dataLength / (sizeof(float) * channelCount));

                for (long long f = 0; f < nFrames; f++) {
                    const long long frameIndex = decodedFrames + f;
                    int col;
                    if (totalFrames > 0) {
                        col = (int)((frameIndex * kWaveformControlPoints) / totalFrames);
                    } else {
                        col = (int)(frameIndex % kWaveformControlPoints);
                    }
                    if (col < 0) col = 0;
                    if (col >= kWaveformControlPoints) col = kWaveformControlPoints - 1;

                    for (uint32_t ch = 0; ch < channelCount; ch++) {
                        float s = samples[f * channelCount + ch];
                        sumSq[col] += (double)(s * s);
                        counts[col]++;
                    }
                }
                decodedFrames += nFrames;
            }
        }

        CMSampleBufferInvalidate(buffer);
        CFRelease(buffer);
    }

    [reader cancelReading];

    if (decodedFrames == 0 || channelCount == 0) return nil;

    float amps[kWaveformControlPoints];
    for (int i = 0; i < kWaveformControlPoints; i++) {
        amps[i] = counts[i] > 0 ? (float)sqrt(sumSq[i] / counts[i]) : 0.0f;
    }

    return [NSData dataWithBytes:amps length:sizeof(amps)];
}

+ (nullable NSData *)renderWaveformFromAmps:(nonnull NSData *)ampsData
                                      width:(NSInteger)widthIn
                                     height:(NSInteger)heightIn {
    if (!ampsData || ampsData.length == 0) return nil;
    const NSInteger width  = widthIn  > 0 ? widthIn  : kDefaultWaveformWidth;
    const NSInteger height = heightIn > 0 ? heightIn : kDefaultWaveformHeight;

    const uint32_t numAmps = (uint32_t)(ampsData.length / sizeof(float));
    if (numAmps < 2) return nil;

    // Smoothing, normalisation and Catmull-Rom → cubic-Bézier control points are
    // computed once in shared Zig (waveform_generator.zig); we replay the returned
    // outline into a UIBezierPath and let CoreGraphics anti-alias the fill.
    const uint32_t capacity = 2 + (2 * numAmps - 1) * 6;
    float *pts = (float *)malloc(capacity * sizeof(float));
    if (!pts) return nil;
    uint32_t count = 0;
    const bool ok = atolla_waveform_build_path((const float *)ampsData.bytes, numAmps,
                                               (float)width, (float)height,
                                               pts, capacity, &count);
    if (!ok || count < 8) {
        free(pts);
        return nil;
    }

    UIBezierPath *path = [UIBezierPath bezierPath];
    [path moveToPoint:CGPointMake(pts[0], pts[1])];
    for (uint32_t i = 2; i + 6 <= count; i += 6) {
        [path addCurveToPoint:CGPointMake(pts[i + 4], pts[i + 5])
                controlPoint1:CGPointMake(pts[i],     pts[i + 1])
                controlPoint2:CGPointMake(pts[i + 2], pts[i + 3])];
    }
    [path closePath];
    free(pts);

    CGFloat scale = [UIScreen mainScreen].scale;
    UIGraphicsBeginImageContextWithOptions(CGSizeMake(width, height), NO, scale);
    [[UIColor whiteColor] setFill];
    [path fill];
    UIImage *image = UIGraphicsGetImageFromCurrentImageContext();
    UIGraphicsEndImageContext();

    if (!image) return nil;
    return UIImagePNGRepresentation(image);
}

+ (nullable NSData *)generateWaveformFromAudioPath:(nonnull NSString *)audioPath
                                             width:(NSInteger)width
                                            height:(NSInteger)height {
    NSData *ampsData = [self extractAmpsFromAudioPath:audioPath];
    if (!ampsData) return nil;
    return [self renderWaveformFromAmps:ampsData width:width height:height];
}

@end
