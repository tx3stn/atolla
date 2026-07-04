#import "atolla/native/ios/AtollaImageFallback.h"

NSString *_Nullable AtollaThumbFallbackCategory(NSString *category) {
    if ([category isEqualToString:@"album_art"]) return @"album_art_thumb";
    if ([category isEqualToString:@"artist_image"]) return @"artist_image_thumb";
    if ([category isEqualToString:@"playlist_image"]) return @"playlist_image_thumb";
    return nil;
}

NSArray<NSString *> *AtollaBlurSourceKeys(NSString *identity) {
    return @[
        [NSString stringWithFormat:@"album_art_thumb:%@", identity],
        [NSString stringWithFormat:@"album_art:%@", identity],
    ];
}

NSString *AtollaImageCacheIdentity(NSString *url) {
    NSURLComponents *components = [NSURLComponents componentsWithString:url];
    NSString *path = components.path ?: url;

    static NSRegularExpression *itemImageIdRegex;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        itemImageIdRegex = [NSRegularExpression regularExpressionWithPattern:@"/Items/([^/]+)/Images/"
                                                                    options:0
                                                                      error:nil];
    });
    NSTextCheckingResult *match = [itemImageIdRegex firstMatchInString:path
                                                              options:0
                                                                range:NSMakeRange(0, path.length)];
    if (match && [match rangeAtIndex:1].location != NSNotFound) {
        NSString *itemId = [path substringWithRange:[match rangeAtIndex:1]];
        NSString *tag = nil;
        for (NSURLQueryItem *item in components.queryItems) {
            if ([item.name isEqualToString:@"tag"]) {
                tag = item.value;
                break;
            }
        }
        return tag.length > 0 ? [NSString stringWithFormat:@"%@:%@", itemId, tag] : itemId;
    }

    // fallback: return the URL with api_key stripped
    if (components.queryItems.count > 0) {
        NSMutableArray<NSURLQueryItem *> *kept = [NSMutableArray array];
        for (NSURLQueryItem *item in components.queryItems) {
            if (![item.name isEqualToString:@"api_key"]) [kept addObject:item];
        }
        components.queryItems = kept.count > 0 ? kept : nil;
        return components.URL.absoluteString ?: url;
    }
    return url;
}
