#import "waveform_ios_bridge.h"
#import <AVFoundation/AVFoundation.h>
#import <UIKit/UIKit.h>
#include <math.h>
#include <stdlib.h>
#include <string.h>

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

    float amps[300];
    const uint32_t n = numAmps < 300 ? numAmps : 300;
    memcpy(amps, ampsData.bytes, n * sizeof(float));

    // 5-point centred moving average — removes RMS noise, curves handle visual smoothness
    if (n >= 3) {
        float tmp[300];
        memcpy(tmp, amps, n * sizeof(float));
        for (uint32_t i = 0; i < n; i++) {
            uint32_t lo = i > 2 ? i - 2 : 0;
            uint32_t hi = (i + 2 < n) ? i + 2 : n - 1;
            float s = 0.0f; uint32_t cnt = 0;
            for (uint32_t j = lo; j <= hi; j++) { s += tmp[j]; cnt++; }
            amps[i] = s / cnt;
        }
    }

    // Normalise: loudest column → 1.0; silence → flat 0.5
    float maxAmp = 0.0f;
    for (uint32_t i = 0; i < n; i++) if (amps[i] > maxAmp) maxAmp = amps[i];
    if (maxAmp < 1e-6f) {
        for (uint32_t i = 0; i < n; i++) amps[i] = 0.5f;
    } else {
        for (uint32_t i = 0; i < n; i++) amps[i] /= maxAmp;
    }

    const CGFloat cx = width / 2.0;
    const CGFloat cy = height / 2.0;

    CGPoint topPts[300], botPts[300];
    for (uint32_t i = 0; i < n; i++) {
        CGFloat x = (n > 1) ? (CGFloat)i * (width - 1) / (n - 1) : cx;
        topPts[i] = CGPointMake(x, cy - amps[i] * cy);
        botPts[i] = CGPointMake(x, cy + amps[i] * cy);
    }

    // Catmull-Rom → cubic Bézier: cp1 = p1+(p2-p0)/6, cp2 = p2-(p3-p1)/6
    UIBezierPath *path = [UIBezierPath bezierPath];

    // Top edge: left → right
    [path moveToPoint:topPts[0]];
    for (uint32_t i = 0; i < n - 1; i++) {
        CGPoint p0 = (i > 0) ? topPts[i-1] : topPts[0];
        CGPoint p1 = topPts[i];
        CGPoint p2 = topPts[i+1];
        CGPoint p3 = (i + 2 < n) ? topPts[i+2] : topPts[n-1];
        CGPoint cp1 = CGPointMake(p1.x + (p2.x - p0.x) / 6.0, p1.y + (p2.y - p0.y) / 6.0);
        CGPoint cp2 = CGPointMake(p2.x - (p3.x - p1.x) / 6.0, p2.y - (p3.y - p1.y) / 6.0);
        [path addCurveToPoint:p2 controlPoint1:cp1 controlPoint2:cp2];
    }

    // Bottom edge: right → left
    [path addLineToPoint:botPts[n-1]];
    for (NSInteger i = (NSInteger)n - 2; i >= 0; i--) {
        CGPoint p0 = (i < (NSInteger)n - 2) ? botPts[i+2] : botPts[n-1];
        CGPoint p1 = botPts[i+1];
        CGPoint p2 = botPts[i];
        CGPoint p3 = (i > 0) ? botPts[i-1] : botPts[0];
        CGPoint cp1 = CGPointMake(p1.x + (p2.x - p0.x) / 6.0, p1.y + (p2.y - p0.y) / 6.0);
        CGPoint cp2 = CGPointMake(p2.x - (p3.x - p1.x) / 6.0, p2.y - (p3.y - p1.y) / 6.0);
        [path addCurveToPoint:p2 controlPoint1:cp1 controlPoint2:cp2];
    }

    [path closePath];

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
