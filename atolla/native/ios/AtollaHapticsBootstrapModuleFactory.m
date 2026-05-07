#import <atollaTypes/atollaTypes.h>
#import <valdi_core/SCValdiModuleFactoryRegistry.h>
#import <UIKit/UIKit.h>
#import <Foundation/Foundation.h>

@protocol AtollaHapticRuntime <NSObject>
- (void)setPerformHapticFeedbackFunctionBlock:(void (^)(NSString *))block;
@end

// MARK: - Module

@interface AtollaHapticsBootstrapModuleImpl : NSObject <atollaHapticsBootstrapModule>
@end

@implementation AtollaHapticsBootstrapModuleImpl

- (void)ensureAtollaHapticsBootstrap {
    Class cls = NSClassFromString(@"SCValdiRuntimeManager");
    if (!cls) return;
    NSArray *managers = [cls performSelector:NSSelectorFromString(@"allRuntimeManagers")];
    for (id manager in managers) {
        if (![manager respondsToSelector:NSSelectorFromString(@"mainRuntime")]) continue;
        id runtime = [manager valueForKey:@"mainRuntime"];
        if (!runtime || ![runtime conformsToProtocol:@protocol(AtollaHapticRuntime)]) continue;
        [(id<AtollaHapticRuntime>)runtime setPerformHapticFeedbackFunctionBlock:^(NSString *type) {
            dispatch_async(dispatch_get_main_queue(), ^{
                if ([type isEqualToString:@"vibration"]) {
                    UIImpactFeedbackGenerator *g = [[UIImpactFeedbackGenerator alloc] initWithStyle:UIImpactFeedbackStyleHeavy];
                    [g impactOccurred];
                } else if ([type isEqualToString:@"action_sheet"]) {
                    UIImpactFeedbackGenerator *g = [[UIImpactFeedbackGenerator alloc] initWithStyle:UIImpactFeedbackStyleMedium];
                    [g impactOccurred];
                } else {
                    UISelectionFeedbackGenerator *g = [[UISelectionFeedbackGenerator alloc] init];
                    [g selectionChanged];
                }
            });
        }];
    }
}

@end

// MARK: - Factory

@interface AtollaHapticsBootstrapModuleFactoryImpl : atollaHapticsBootstrapModuleFactory
@end

@implementation AtollaHapticsBootstrapModuleFactoryImpl

VALDI_REGISTER_MODULE()

- (id<atollaHapticsBootstrapModule>)onLoadModule {
    return [[AtollaHapticsBootstrapModuleImpl alloc] init];
}

@end
