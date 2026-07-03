#import "AtollaFloatingView.h"

// A transparent container that passes touches through everywhere EXCEPT where its
// subviews (the floating layers) actually are, so the app behind the overlay stays
// interactive.
@interface AtollaFloatingOverlayContainer : UIView
@end

@implementation AtollaFloatingOverlayContainer

- (UIView *)hitTest:(CGPoint)point withEvent:(UIEvent *)event
{
    UIView *hit = [super hitTest:point withEvent:event];
    return hit == self ? nil : hit;
}

@end

@implementation AtollaFloatingView {
    AtollaFloatingOverlayContainer *_overlay;
}

- (instancetype)initWithFrame:(CGRect)frame
{
    self = [super initWithFrame:frame];
    if (self) {
        _overlay = [[AtollaFloatingOverlayContainer alloc] initWithFrame:frame];
        _overlay.backgroundColor = [UIColor clearColor];
    }
    return self;
}

#pragma mark - SCValdiContentViewProviding

// Valdi inserts our children into the window-level overlay rather than into `self`, so they
// escape the navigation container. Valdi lays them out relative to this view's (full-screen)
// bounds, and the overlay is sized to the full window, so the frames line up.
- (UIView *)contentViewForInsertingValdiChildren
{
    return _overlay;
}

#pragma mark - UIView

// Keep the overlay attached to the window (above the app's navigation content) and on top.
// `self` stays where Valdi puts it — an empty, full-screen, touch-passing layout anchor.
// The engine transiently removes/re-inserts our native view during view-tree updates (e.g.
// once a push settles), which fires didMoveToWindow with a nil window mid-update — we must
// NOT tear the overlay down on that blip, or the floating layers vanish after the transition. The
// overlay lives until we're actually deallocated.
- (void)didMoveToWindow
{
    [super didMoveToWindow];
    [self attachOverlayIfPossible];
}

- (void)didMoveToSuperview
{
    [super didMoveToSuperview];
    [self attachOverlayIfPossible];
}

- (void)attachOverlayIfPossible
{
    UIWindow *window = self.window;
    if (window == nil) {
        // Transient detach during a view-tree update — leave the overlay where it is.
        return;
    }

    if (_overlay.superview != window) {
        _overlay.frame = window.bounds;
        _overlay.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
        [window addSubview:_overlay];
    } else {
        [window bringSubviewToFront:_overlay];
    }
}

// `self` holds no content (it lives in `_overlay`), so it must never intercept touches.
- (UIView *)hitTest:(CGPoint)point withEvent:(UIEvent *)event
{
    UIView *hit = [super hitTest:point withEvent:event];
    return hit == self ? nil : hit;
}

- (void)dealloc
{
    [_overlay removeFromSuperview];
}

@end
