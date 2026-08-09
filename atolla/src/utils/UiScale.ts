// below this the window is a phone and nothing scales; above it sizes ramp to their maximum, which
// is reached at the width the tablet layout was tuned against
const PHONE_MAX_WIDTH = 440;
const TABLET_WIDTH = 834;
const UI_SCALE_MAX = 1.5;
// gestures are made by a hand, not by the layout, so they grow far less than the rows they act on: a
// swipe that scaled with the interface would be an unreasonably long drag on a tablet
const GESTURE_SCALE_MAX = 1.15;

export function deriveGestureScale(windowWidth: number): number {
	return rampedScale(windowWidth, GESTURE_SCALE_MAX);
}

export function deriveUiScale(windowWidth: number): number {
	return rampedScale(windowWidth, UI_SCALE_MAX);
}

function rampedScale(windowWidth: number, max: number): number {
	if (!Number.isFinite(windowWidth) || windowWidth <= 0) {
		return 1;
	}

	const growth = Math.max(
		0,
		Math.min(1, (windowWidth - PHONE_MAX_WIDTH) / (TABLET_WIDTH - PHONE_MAX_WIDTH)),
	);

	return 1 + (max - 1) * growth;
}
