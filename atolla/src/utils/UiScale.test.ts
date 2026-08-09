import { describe, expect, it } from 'bun:test';
import { deriveGestureScale, deriveNavScale, deriveUiScale } from './UiScale';

// the scale exists to make a tablet readable, so no phone may move a single point
describe('deriveUiScale on phone widths', () => {
	const phoneWidths = [320, 360, 375, 390, 393, 402, 411, 430, 440];

	for (const width of phoneWidths) {
		it(`stays exactly 1 at ${width}pt`, () => {
			expect(deriveUiScale(width)).toBe(1);
		});
	}
});

describe('deriveUiScale on tablet widths', () => {
	it('scales up once past the widest phone', () => {
		expect(deriveUiScale(744)).toBeGreaterThan(1);
		expect(deriveUiScale(800)).toBeGreaterThan(deriveUiScale(744));
		expect(deriveUiScale(834)).toBeGreaterThan(deriveUiScale(800));
	});

	// past the tuning width the scale holds rather than inflating text on ever wider screens
	it('stops growing past the tablet width', () => {
		expect(deriveUiScale(1024)).toBe(deriveUiScale(834));
		expect(deriveUiScale(2048)).toBe(deriveUiScale(834));
	});
});

describe('deriveUiScale with an unusable width', () => {
	it('falls back to unscaled rather than collapsing every size', () => {
		expect(deriveUiScale(0)).toBe(1);
		expect(deriveUiScale(Number.NaN)).toBe(1);
		expect(deriveUiScale(-100)).toBe(1);
	});
});

describe('deriveGestureScale on phone widths', () => {
	const phoneWidths = [320, 360, 375, 390, 393, 402, 411, 430, 440];

	for (const width of phoneWidths) {
		it(`stays exactly 1 at ${width}pt`, () => {
			expect(deriveGestureScale(width)).toBe(1);
		});
	}
});

describe('deriveGestureScale on tablet widths', () => {
	it('grows with the window', () => {
		expect(deriveGestureScale(744)).toBeGreaterThan(1);
		expect(deriveGestureScale(800)).toBeGreaterThan(deriveGestureScale(744));
		expect(deriveGestureScale(834)).toBeGreaterThan(deriveGestureScale(800));
	});

	// the whole reason this ramp is separate: a swipe that grew with the row it acts on would be an
	// unreasonably long drag, so it must stay well below the interface scale
	it('grows far less than the interface around it', () => {
		expect(deriveGestureScale(834)).toBeLessThan(deriveUiScale(834));
		expect(deriveGestureScale(834)).toBeLessThan(1.2);
	});

	it('stops growing past the tablet width', () => {
		expect(deriveGestureScale(1024)).toBe(deriveGestureScale(834));
		expect(deriveGestureScale(2048)).toBe(deriveGestureScale(834));
	});
});

describe('deriveGestureScale with an unusable width', () => {
	it('falls back to unscaled rather than collapsing the swipe threshold', () => {
		expect(deriveGestureScale(0)).toBe(1);
		expect(deriveGestureScale(Number.NaN)).toBe(1);
		expect(deriveGestureScale(-100)).toBe(1);
	});
});

describe('deriveNavScale on phone widths', () => {
	const phoneWidths = [320, 360, 375, 390, 393, 402, 411, 430, 440];

	for (const width of phoneWidths) {
		it(`stays exactly 1 at ${width}pt`, () => {
			expect(deriveNavScale(width)).toBe(1);
		});
	}
});

describe('deriveNavScale on tablet widths', () => {
	it('grows with the window', () => {
		expect(deriveNavScale(744)).toBeGreaterThan(1);
		expect(deriveNavScale(834)).toBeGreaterThan(deriveNavScale(744));
	});

	// the header and footer are furniture around the content, not content: they grow enough to stay
	// comfortable targets but must not eat the screen the way a fully scaled bar does
	it('grows far less than the interface it frames', () => {
		expect(deriveNavScale(834)).toBeLessThan(deriveUiScale(834));
		expect(deriveNavScale(834)).toBeLessThan(1.25);
	});

	it('stops growing past the tablet width', () => {
		expect(deriveNavScale(1024)).toBe(deriveNavScale(834));
		expect(deriveNavScale(2048)).toBe(deriveNavScale(834));
	});
});

describe('deriveNavScale with an unusable width', () => {
	it('falls back to unscaled rather than collapsing the bars', () => {
		expect(deriveNavScale(0)).toBe(1);
		expect(deriveNavScale(Number.NaN)).toBe(1);
		expect(deriveNavScale(-100)).toBe(1);
	});
});
