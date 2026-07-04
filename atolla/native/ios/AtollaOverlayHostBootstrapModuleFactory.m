#import <atollaTypes/atollaTypes.h>
#import <valdi_core/SCValdiModuleFactoryRegistry.h>
#import "AtollaOverlayHost.h"

// Bridges the JS `ensureAtollaOverlayHostBootstrap()` (OverlayHostBootstrap.d.ts) to the native
// overlay-window spike. Mirrors AtollaHapticsBootstrapModuleFactory.

@interface AtollaOverlayHostBootstrapModuleImpl : NSObject <atollaOverlayHostBootstrapModule>
@end

@implementation AtollaOverlayHostBootstrapModuleImpl

- (void)ensureAtollaOverlayHostBootstrap
{
    [AtollaOverlayHost ensure];
}

@end

@interface AtollaOverlayHostBootstrapModuleFactoryImpl : atollaOverlayHostBootstrapModuleFactory
@end

@implementation AtollaOverlayHostBootstrapModuleFactoryImpl

VALDI_REGISTER_MODULE()

- (id<atollaOverlayHostBootstrapModule>)onLoadModule
{
    return [[AtollaOverlayHostBootstrapModuleImpl alloc] init];
}

@end
