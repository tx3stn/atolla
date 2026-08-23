#import "atolla_app/native/ios/AtollaImageCacheAccess.h"

static AtollaCachedImageResolver _Nullable gResolver = nil;

void AtollaSetCachedImageResolver(AtollaCachedImageResolver _Nullable resolver) {
    gResolver = [resolver copy];
}

NSString *_Nullable AtollaResolveCachedImageFileUrl(NSString *category, NSString *identity) {
    AtollaCachedImageResolver resolver = gResolver;
    if (!resolver || !category.length || !identity.length) {
        return nil;
    }
    return resolver(category, identity);
}
