#import "AtollaOverlayHost.h"

#import <UIKit/UIKit.h>
#import <valdi_core/SCValdiComponentContainerView.h>

// Hosts the OverlayHost Valdi root as a standalone, always-on-top layer on the main window — see
// AtollaOverlayHost.h.

static NSString *const kOverlayComponentPath =
    @"OverlayWindowRoot@atolla/src/ui/components/OverlayWindowRoot";

static UIView *sOverlayView = nil;

@implementation AtollaOverlayHost

+ (void)ensure
{
    // Defer so the main window + runtime are fully set up and we don't inflate a second root
    // re-entrantly during the App root's own creation.
    dispatch_async(dispatch_get_main_queue(), ^{
        [self attachIfNeeded];
    });
}

+ (void)attachIfNeeded
{
    if (sOverlayView != nil) {
        return;
    }

    id runtime = [self mainRuntime];
    if (runtime == nil) {
        return;
    }

    UIWindow *mainWindow = [self mainWindow];
    if (mainWindow == nil) {
        return;
    }

    SCValdiComponentContainerView *overlayView =
        [[SCValdiComponentContainerView alloc] initWithComponentPath:kOverlayComponentPath
                                                               owner:nil
                                                           viewModel:nil
                                                    componentContext:@{}
                                                             runtime:runtime];
    overlayView.frame = mainWindow.bounds;
    overlayView.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
    overlayView.backgroundColor = [UIColor clearColor];
    // OverlayHost's bars reparent into AtollaFloatingView's window-level pass-through layer, so this
    // root is an empty, always-attached layout anchor (attached = no freeze). Disable it so empty
    // regions fall through to the app; the reparented bars keep their own interactivity.
    overlayView.userInteractionEnabled = NO;

    [mainWindow addSubview:overlayView];
    sOverlayView = overlayView;
}

+ (id)mainRuntime
{
    Class managerClass = NSClassFromString(@"SCValdiRuntimeManager");
    if (managerClass == nil) {
        return nil;
    }
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Warc-performSelector-leaks"
    NSArray *managers = [managerClass performSelector:NSSelectorFromString(@"allRuntimeManagers")];
#pragma clang diagnostic pop
    for (id manager in managers) {
        if ([manager respondsToSelector:NSSelectorFromString(@"mainRuntime")]) {
            id runtime = [manager valueForKey:@"mainRuntime"];
            if (runtime != nil) {
                return runtime;
            }
        }
    }
    return nil;
}

+ (UIWindow *)mainWindow
{
    for (UIWindow *window in UIApplication.sharedApplication.windows) {
        if (window.isKeyWindow) {
            return window;
        }
    }
    return UIApplication.sharedApplication.windows.firstObject;
}

@end
