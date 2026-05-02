#import "waveform_ios_bridge.h"
#import <AVFoundation/AVFoundation.h>
#include <math.h>
#include <stdlib.h>
#include "waveform_generator.h"

static const NSInteger kDefaultWaveformWidth   = 500;
static const NSInteger kDefaultWaveformHeight  = 100;
static const NSInteger kWaveformControlPoints  = 100;

@implementation AtollaWaveformGenerator

+ (nullable NSData *)generateWaveformFromAudioPath:(nonnull NSString *)audioPath
                                             width:(NSInteger)widthIn
                                            height:(NSInteger)heightIn {
    const NSInteger width  = widthIn  > 0 ? widthIn  : kDefaultWaveformWidth;
    const NSInteger height = heightIn > 0 ? heightIn : kDefaultWaveformHeight;

    NSURL *url = ([audioPath hasPrefix:@"http://"] || [audioPath hasPrefix:@"https://"])
        ? [NSURL URLWithString:audioPath]
        : [NSURL fileURLWithPath:audioPath];
    AVAsset *asset = [AVAsset assetWithURL:url];
    NSArray<AVAssetTrack *> *tracks = [asset tracksWithMediaType:AVMediaTypeAudio];
    if (tracks.count == 0) return nil;

    // 500 Hz is sufficient for amplitude envelope extraction over 100 control
    // points. AVFoundation resamples during decode so only ~500 samples/sec
    // flow through the accumulation loop regardless of the source sample rate.
    NSDictionary *outputSettings = @{
        AVFormatIDKey:               @(kAudioFormatLinearPCM),
        AVLinearPCMBitDepthKey:      @32,
        AVLinearPCMIsFloatKey:       @YES,
        AVLinearPCMIsBigEndianKey:   @NO,
        AVLinearPCMIsNonInterleaved: @NO,
        AVSampleRateKey:             @500.0,
    };

    NSError *error = nil;
    AVAssetReader *reader = [AVAssetReader assetReaderWithAsset:asset error:&error];
    if (!reader || error) return nil;

    AVAssetReaderTrackOutput *output =
        [AVAssetReaderTrackOutput assetReaderTrackOutputWithTrack:tracks[0]
                                                   outputSettings:outputSettings];
    output.alwaysCopiesSampleData = NO;
    [reader addOutput:output];

    if (![reader startReading]) return nil;

    // Derive total frame count from track duration + sample rate so each
    // decoded frame maps to the correct column across the full track length.
    const CMTime duration   = asset.duration;
    const Float64 sampleRate = 500.0;
    const long long totalFrames = (duration.timescale > 0)
        ? (long long)(CMTimeGetSeconds(duration) * sampleRate + 0.5)
        : 0;

    // Accumulate sum-of-squares and sample counts per control-point column.
    // No intermediate PCM buffer — each CMSampleBuffer is processed and released
    // immediately, keeping peak memory proportional to one decoded buffer.
    double sumSq[kWaveformControlPoints] = {0};
    int    counts[kWaveformControlPoints] = {0};
    long long decodedFrames = 0;
    uint32_t channelCount   = 0;

    while (reader.status == AVAssetReaderStatusReading) {
        CMSampleBufferRef buffer = [output copyNextSampleBuffer];
        if (!buffer) break;

        // Capture channel count from the first buffer.
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

    uint32_t out_len = 0;
    uint8_t *png = atolla_render_waveform_from_amps(
        amps, (uint32_t)kWaveformControlPoints,
        (uint32_t)width, (uint32_t)height, &out_len);

    if (!png || out_len == 0) return nil;

    return [NSData dataWithBytesNoCopy:png length:out_len freeWhenDone:YES];
}

@end
