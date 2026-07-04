#import <Foundation/Foundation.h>

// Mounts the OverlayHost Valdi root as a standalone, always-on-top layer attached directly to the
// app's main window (on the shared main runtime), so the header / now-playing / footer / modals stay
// laid out and interactive over native detail pushes. The App root's view detaches on push, which
// freezes an in-tree overlay; this root is attached straight to the window and never detaches.
@interface AtollaOverlayHost : NSObject

// Idempotent. Safe to call repeatedly; the overlay is attached once.
+ (void)ensure;

@end
