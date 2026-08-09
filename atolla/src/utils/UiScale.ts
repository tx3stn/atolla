// below this the window is a phone and nothing scales; above it sizes ramp to their maximum, which
// is reached at the width the tablet layout was tuned against
const PHONE_MAX_WIDTH = 440;
const TABLET_WIDTH = 834;
const UI_SCALE_MAX = 1.5;
// gestures are made by a hand, not by the layout, so they grow far less than the rows they act on: a
// swipe that scaled with the interface would be an unreasonably long drag on a tablet
const GESTURE_SCALE_MAX = 1.15;
// the header and footer frame the content rather than being content, so they grow just enough to stay
// comfortable targets. fully scaled they read as too tall and eat the screen
const NAV_SCALE_MAX = 1.2;
// the expanded player is one fixed surface rather than a list to read through: its type and controls
// are already large and central, so they only need modest growth. kept apart from the nav ramp even
// though the ceilings match today, so tuning the player cannot silently resize the header and footer
const PLAYER_SCALE_MAX = 1.2;
// artwork and logos are the reason for the extra canvas, so they ramp past the interface scale to use
// it. safe to be generous: they are laid out with objectFit contain inside a column, so a wide one
// stops growing when it meets the column width rather than when it meets this ceiling
const HERO_SCALE_MAX = 2.3;

export function deriveHeroScale(windowWidth: number): number {
	return rampedScale(windowWidth, HERO_SCALE_MAX);
}

export function deriveGestureScale(windowWidth: number): number {
	return rampedScale(windowWidth, GESTURE_SCALE_MAX);
}

export function deriveNavScale(windowWidth: number): number {
	return rampedScale(windowWidth, NAV_SCALE_MAX);
}

export function derivePlayerScale(windowWidth: number): number {
	return rampedScale(windowWidth, PLAYER_SCALE_MAX);
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
