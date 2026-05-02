#import "waveform_ios_bridge.h"
#import <AVFoundation/AVFoundation.h>
#include <stdlib.h>
#include "waveform_generator.h"

static const NSInteger kDefaultWaveformWidth  = 256;
static const NSInteger kDefaultWaveformHeight = 128;

@implementation AtollaWaveformGenerator

+ (nullable NSData *)generateWaveformFromAudioPath:(nonnull NSString *)audioPath
                                             width:(NSInteger)widthIn
                                            height:(NSInteger)heightIn {
    const NSInteger width  = widthIn  > 0 ? widthIn  : kDefaultWaveformWidth;
    const NSInteger height = heightIn > 0 ? heightIn : kDefaultWaveformHeight;

    NSURL *url = [NSURL fileURLWithPath:audioPath];
    AVAsset *asset = [AVAsset assetWithURL:url];
    NSArray<AVAssetTrack *> *tracks = [asset tracksWithMediaType:AVMediaTypeAudio];
    if (tracks.count == 0) return nil;

    // Configure AVAssetReaderTrackOutput to decode to linear PCM float32.
    NSDictionary *outputSettings = @{
        AVFormatIDKey:         @(kAudioFormatLinearPCM),
        AVLinearPCMBitDepthKey:    @32,
        AVLinearPCMIsFloatKey:     @YES,
        AVLinearPCMIsBigEndianKey: @NO,
        AVLinearPCMIsNonInterleaved: @NO,
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

    // Accumulate all decoded PCM into a contiguous float buffer.
    NSMutableData *pcm = [NSMutableData data];
    uint32_t channel_count = 0;

    while (reader.status == AVAssetReaderStatusReading) {
        CMSampleBufferRef buffer = [output copyNextSampleBuffer];
        if (!buffer) break;

        CMBlockBufferRef block = CMSampleBufferGetDataBuffer(buffer);
        if (block) {
            size_t length = CMBlockBufferGetDataLength(block);
            const size_t offset = pcm.length;
            [pcm increaseLengthBy:length];
            CMBlockBufferCopyDataBytes(block, 0, length, (uint8_t *)pcm.mutableBytes + offset);
        }

        // Capture channel count from the first buffer's format description.
        if (channel_count == 0) {
            CMFormatDescriptionRef fmt = CMSampleBufferGetFormatDescription(buffer);
            if (fmt) {
                const AudioStreamBasicDescription *asbd =
                    CMAudioFormatDescriptionGetStreamBasicDescription(fmt);
                if (asbd) channel_count = (uint32_t)asbd->mChannelsPerFrame;
            }
        }

        CMSampleBufferInvalidate(buffer);
        CFRelease(buffer);
    }

    [reader cancelReading];

    if (pcm.length == 0 || channel_count == 0) return nil;

    const float *samples = (const float *)pcm.bytes;
    const uint32_t sample_count = (uint32_t)(pcm.length / sizeof(float));

    uint32_t out_len = 0;
    uint8_t *png = atolla_generate_waveform(
        samples, sample_count, channel_count,
        (uint32_t)width, (uint32_t)height, &out_len);

    if (!png || out_len == 0) return nil;

    NSData *result = [NSData dataWithBytesNoCopy:png length:out_len freeWhenDone:YES];
    return result;
}

@end
