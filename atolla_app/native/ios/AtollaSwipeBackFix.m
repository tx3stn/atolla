#import <UIKit/UIKit.h>
#import <objc/runtime.h>

// iOS disables interactivePopGestureRecognizer when navigationBarHidden = YES because the
// private _UINavigationInteractiveTransition delegate returns NO from shouldBegin. This
// delegate replaces it with one that only checks viewControllers.count > 1.
@interface AtollaSwipeBackGestureDelegate : NSObject <UIGestureRecognizerDelegate>
@property (nonatomic, weak) UINavigationController *navigationController;
@end

@implementation AtollaSwipeBackGestureDelegate

- (BOOL)gestureRecognizerShouldBegin:(UIGestureRecognizer *)gestureRecognizer {
    return self.navigationController.viewControllers.count > 1;
}

@end

@interface AtollaSwipeBackFix : NSObject
+ (void)applyToNavigationController:(UINavigationController *)navigationController;
@end

@implementation AtollaSwipeBackFix

+ (void)applyToNavigationController:(UINavigationController *)navigationController {
    if (![navigationController isKindOfClass:[UINavigationController class]]) return;
    AtollaSwipeBackGestureDelegate *delegate = [[AtollaSwipeBackGestureDelegate alloc] init];
    delegate.navigationController = navigationController;
    // retain delegate for the lifetime of the navigation controller
    objc_setAssociatedObject(navigationController,
                             "AtollaSwipeBackGestureDelegate",
                             delegate,
                             OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    navigationController.interactivePopGestureRecognizer.delegate = delegate;
}

+ (void)load {
    // apply fix after the navigation controller has been set up
    dispatch_async(dispatch_get_main_queue(), ^{
        UIWindow *window = UIApplication.sharedApplication.windows.firstObject;
        if ([window.rootViewController isKindOfClass:[UINavigationController class]]) {
            [self applyToNavigationController:(UINavigationController *)window.rootViewController];
        }
    });
}

@end
