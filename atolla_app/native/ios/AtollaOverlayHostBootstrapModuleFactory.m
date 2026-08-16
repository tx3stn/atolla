#import <atolla_appTypes/atolla_appTypes.h>
#import <valdi_core/SCValdiModuleFactoryRegistry.h>
#import "AtollaOverlayHost.h"

// Bridges the JS `ensureAtollaOverlayHostBootstrap()` (OverlayHostBootstrap.d.ts) to the native
// overlay-window spike. Mirrors AtollaHapticsBootstrapModuleFactory.

@interface AtollaOverlayHostBootstrapModuleImpl : NSObject <atolla_appOverlayHostBootstrapModule>
@end

@implementation AtollaOverlayHostBootstrapModuleImpl

- (void)ensureAtollaOverlayHostBootstrap
{
    [AtollaOverlayHost ensure];
}

@end

@interface AtollaOverlayHostBootstrapModuleFactoryImpl : atolla_appOverlayHostBootstrapModuleFactory
@end

@implementation AtollaOverlayHostBootstrapModuleFactoryImpl

VALDI_REGISTER_MODULE()

- (id<atolla_appOverlayHostBootstrapModule>)onLoadModule
{
    return [[AtollaOverlayHostBootstrapModuleImpl alloc] init];
}

@end
