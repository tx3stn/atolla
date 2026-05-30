#import "atolla/native/ios/AtollaImageFallback.h"

NSString *_Nullable AtollaThumbFallbackCategory(NSString *category) {
    if ([category isEqualToString:@"album_art"]) return @"album_art_thumb";
    if ([category isEqualToString:@"artist_image"]) return @"artist_image_thumb";
    if ([category isEqualToString:@"playlist_image"]) return @"playlist_image_thumb";
    return nil;
}

NSArray<NSString *> *AtollaBlurSourceKeys(NSString *sourceURL) {
    return @[
        [NSString stringWithFormat:@"album_art_thumb:%@", sourceURL],
        [NSString stringWithFormat:@"album_art:%@", sourceURL],
    ];
}
