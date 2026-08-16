import { type CardSize, CardSizes } from '../models/App';

// the width the card sizes were tuned against, and the width at which cards stop growing
const PHONE_WIDTH = 393;
const TABLET_WIDTH = 834;
// how much larger a card may get on the widest screen before another column is added instead
const CARD_GROWTH_MAX = 1.33;

const CARD_TARGET_WIDTH: Record<CardSize, number> = {
	[CardSizes.regular]: 130,
	[CardSizes.small]: 98,
};

// a detail row is an artwork tile plus three lines of text, so it needs a lot more width than a
// browse card before a second column reads as anything other than cramped
const DETAIL_COLUMN_MIN_WIDTH = 360;

export function deriveDetailColumns(windowWidth: number): number {
	if (!Number.isFinite(windowWidth) || windowWidth <= 0) {
		return 1;
	}

	return Math.max(1, Math.floor(windowWidth / DETAIL_COLUMN_MIN_WIDTH));
}

// The card size picks a target width, that target grows with the window up to CARD_GROWTH_MAX, and
// the column count is whatever divides the window closest to it. Every phone width lands on 3
// (regular) and 4 (small), which is what the app rendered when the setting was a literal count.
export function deriveGridColumns(windowWidth: number, cardSize: CardSize): number {
	const width = Number.isFinite(windowWidth) && windowWidth > 0 ? windowWidth : PHONE_WIDTH;
	const growth = Math.max(0, Math.min(1, (width - PHONE_WIDTH) / (TABLET_WIDTH - PHONE_WIDTH)));
	const targetWidth = CARD_TARGET_WIDTH[cardSize] * (1 + (CARD_GROWTH_MAX - 1) * growth);

	return Math.max(1, Math.round(width / targetWidth));
}
