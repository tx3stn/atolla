import { describe, expect, it } from 'bun:test';
import { deriveUiScale } from './UiScale';

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
