#import "valdi_core/SCValdiContentViewProviding.h"

#import <UIKit/UIKit.h>

// A Valdi custom view (injected via `<custom-view iosClass='AtollaFloatingView'>`) that
// hosts its Valdi children in a window-level overlay, so they float above navigation push
// transitions. On iOS a pushed NavigationView page fills the whole screen and composites
// above sibling views; hoisting the children to the window keeps them fixed while the
// page slides behind them.
@interface AtollaFloatingView : UIView <SCValdiContentViewProviding>

@end
