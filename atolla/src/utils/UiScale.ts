// below this the window is a phone and nothing scales; above it sizes ramp to UI_SCALE_MAX, which
// is reached at the width the tablet layout was tuned against
const PHONE_MAX_WIDTH = 440;
const TABLET_WIDTH = 834;
const UI_SCALE_MAX = 1.5;

export function deriveUiScale(windowWidth: number): number {
	if (!Number.isFinite(windowWidth) || windowWidth <= 0) {
		return 1;
	}

	const growth = Math.max(
		0,
		Math.min(1, (windowWidth - PHONE_MAX_WIDTH) / (TABLET_WIDTH - PHONE_MAX_WIDTH)),
	);

	return 1 + (UI_SCALE_MAX - 1) * growth;
}
