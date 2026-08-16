import { describe, expect, it } from 'bun:test';
import { CardSizes } from '../models/App';
import { deriveDetailColumns, deriveGridColumns } from './GridColumns';

// the counts the app rendered when the setting was a literal column count — every supported phone
// width has to keep producing them or changing the setting's shape becomes a visible regression
describe('deriveGridColumns on phone widths', () => {
	const phoneWidths = [360, 375, 390, 393, 402, 411, 430, 440];

	for (const width of phoneWidths) {
		it(`gives 3 regular columns at ${width}pt`, () => {
			expect(deriveGridColumns(width, CardSizes.regular)).toBe(3);
		});

		it(`gives 4 small columns at ${width}pt`, () => {
			expect(deriveGridColumns(width, CardSizes.small)).toBe(4);
		});
	}
});

describe('deriveGridColumns on tablet widths', () => {
	it('adds columns as the window widens', () => {
		expect(deriveGridColumns(744, CardSizes.regular)).toBe(5);
		expect(deriveGridColumns(800, CardSizes.regular)).toBe(5);
		expect(deriveGridColumns(834, CardSizes.regular)).toBe(5);
		expect(deriveGridColumns(1024, CardSizes.regular)).toBe(6);
	});

	it('adds more columns for the small card size', () => {
		expect(deriveGridColumns(744, CardSizes.small)).toBe(6);
		expect(deriveGridColumns(800, CardSizes.small)).toBe(6);
		expect(deriveGridColumns(834, CardSizes.small)).toBe(6);
		expect(deriveGridColumns(1024, CardSizes.small)).toBe(8);
	});

	// the point of the growth ramp: a tablet card is bigger than a phone card as well as there being
	// more of them, otherwise the extra width just buys more of the same tiny cards
	it('makes cards larger than they are on a phone', () => {
		const phoneCard = 393 / deriveGridColumns(393, CardSizes.regular);
		const tabletCard = 1024 / deriveGridColumns(1024, CardSizes.regular);

		expect(tabletCard).toBeGreaterThan(phoneCard);
	});

	// growth is capped so an unusually wide window keeps cards at a sane size rather than inflating
	it('stops growing cards past the widest tablet', () => {
		expect(deriveGridColumns(2048, CardSizes.regular)).toBe(12);
	});
});

// detail rows carry an artwork tile and three lines of text, so they need far more width than a
// browse card — a phone fits one, a tablet fits two
describe('deriveDetailColumns', () => {
	for (const width of [320, 360, 375, 393, 402, 411, 430, 440]) {
		it(`stays a single column at ${width}pt`, () => {
			expect(deriveDetailColumns(width)).toBe(1);
		});
	}

	for (const width of [744, 800, 834, 1024]) {
		it(`gives two columns at ${width}pt`, () => {
			expect(deriveDetailColumns(width)).toBe(2);
		});
	}

	it('falls back to a single column rather than zero for an unusable width', () => {
		expect(deriveDetailColumns(0)).toBe(1);
		expect(deriveDetailColumns(Number.NaN)).toBe(1);
		expect(deriveDetailColumns(-100)).toBe(1);
	});
});

describe('deriveGridColumns with an unusable width', () => {
	// a zero column count would make CardGrid's row chunking loop forever
	it('falls back to the phone layout rather than returning zero', () => {
		expect(deriveGridColumns(0, CardSizes.regular)).toBe(3);
		expect(deriveGridColumns(Number.NaN, CardSizes.small)).toBe(4);
		expect(deriveGridColumns(-100, CardSizes.regular)).toBe(3);
	});
});
