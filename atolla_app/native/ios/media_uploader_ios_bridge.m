#import "media_uploader_ios_bridge.h"
#include <string.h>
#include "media_uploader.h"

@implementation AtollaMediaUploader

+ (void)initialize {
    if (self != [AtollaMediaUploader class]) {
        return;
    }

    atolla_media_uploader_init();

    NSThread *thread = [[NSThread alloc] initWithBlock:^{
        atolla_media_uploader_run();
    }];
    thread.name = @"atolla-media-uploader";
    [thread start];
}

+ (void)setTargetHost:(NSString *)host port:(uint16_t)port token:(NSString *)token {
    const char *hostBytes = host.UTF8String;
    const char *tokenBytes = token.UTF8String;

    if (!atolla_media_uploader_set_target((const uint8_t *)hostBytes, strlen(hostBytes), port,
                                          (const uint8_t *)tokenBytes, strlen(tokenBytes))) {
        NSLog(@"[AtollaMediaUploader] the uploader refused its target");
    }
}

+ (void)setWindowJson:(NSString *)json {
    const char *bytes = json.UTF8String;

    if (!atolla_media_uploader_set_window((const uint8_t *)bytes, strlen(bytes))) {
        NSLog(@"[AtollaMediaUploader] the uploader refused its window");
    }
}

@end
