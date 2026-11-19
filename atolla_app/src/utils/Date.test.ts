import { describe, expect, it } from 'bun:test';
import fc from 'fast-check';
import { compareDatesDescending, formatDayAndMonth, formatReleaseDate } from './Date';

const isoDate = fc
	.date({
		max: new Date('2100-01-01T00:00:00Z'),
		min: new Date('1900-01-01T00:00:00Z'),
		noInvalidDate: true,
	})
	.map((value) => value.toISOString());

const unparseable = fc.constantFrom(undefined, '', '   ', 'not a date', 'TBA');

const anyDate = fc.oneof(isoDate, unparseable);

function sign(value: number): number {
	return value < 0 ? -1 : value > 0 ? 1 : 0;
}

describe('formatDayAndMonth', () => {
	it('names the day and month', () => {
		expect(formatDayAndMonth('2026-11-20T00:00:00Z', 'en')).toBe('dateDayMonth 20th monthNovember');
	});

	it('names the first and last months', () => {
		expect(formatDayAndMonth('2027-01-04T00:00:00Z', 'en')).toBe('dateDayMonth 4th monthJanuary');
		expect(formatDayAndMonth('2026-12-04T00:00:00Z', 'en')).toBe('dateDayMonth 4th monthDecember');
	});

	it('uses st, nd and rd in english after a 1, 2 or 3', () => {
		const days = ['01', '02', '03', '21', '22', '23', '31'].map((day) =>
			formatDayAndMonth(`2026-12-${day}T00:00:00Z`, 'en'),
		);

		expect(days).toEqual([
			'dateDayMonth 1st monthDecember',
			'dateDayMonth 2nd monthDecember',
			'dateDayMonth 3rd monthDecember',
			'dateDayMonth 21st monthDecember',
			'dateDayMonth 22nd monthDecember',
			'dateDayMonth 23rd monthDecember',
			'dateDayMonth 31st monthDecember',
		]);
	});

	it('uses th in english for the eleventh to the thirteenth', () => {
		const days = ['11', '12', '13'].map((day) =>
			formatDayAndMonth(`2026-12-${day}T00:00:00Z`, 'en'),
		);

		expect(days).toEqual([
			'dateDayMonth 11th monthDecember',
			'dateDayMonth 12th monthDecember',
			'dateDayMonth 13th monthDecember',
		]);
	});

	it('writes the first of the month as 1er in french', () => {
		expect(formatDayAndMonth('2026-12-01T00:00:00Z', 'fr')).toBe('dateDayMonth 1er monthDecember');
	});

	it('writes other days as plain numbers in french', () => {
		expect(formatDayAndMonth('2026-12-21T00:00:00Z', 'fr')).toBe('dateDayMonth 21 monthDecember');
	});

	it('falls back to the date as given when it has no day', () => {
		expect(formatDayAndMonth('2027', 'en')).toBe('2027');
	});
});

describe('formatReleaseDate', () => {
	it('returns null for empty or missing values', () => {
		expect(formatReleaseDate(null)).toBeNull();
		expect(formatReleaseDate(undefined)).toBeNull();
		expect(formatReleaseDate('')).toBeNull();
		expect(formatReleaseDate('   ')).toBeNull();
	});

	it('takes the date portion of an ISO timestamp', () => {
		expect(formatReleaseDate('2023-05-15T00:00:00Z')).toBe('2023-05-15');
	});

	it('truncates a date-prefixed value longer than ten characters', () => {
		expect(formatReleaseDate('2023-05-15 00:00:00')).toBe('2023-05-15');
	});

	it('passes through values that are already a plain date or year', () => {
		expect(formatReleaseDate('2023-05-15')).toBe('2023-05-15');
		expect(formatReleaseDate('2023')).toBe('2023');
	});

	it('trims surrounding whitespace', () => {
		expect(formatReleaseDate('  2023-05-15  ')).toBe('2023-05-15');
	});
});

describe('formatReleaseDate properties', () => {
	it('reduces any ISO timestamp to its ten-character date', () => {
		fc.assert(
			fc.property(isoDate, (value) => {
				expect(formatReleaseDate(value)).toBe(value.slice(0, 10));
			}),
		);
	});

	it('is idempotent', () => {
		fc.assert(
			fc.property(anyDate, (value) => {
				const once = formatReleaseDate(value);

				expect(formatReleaseDate(once)).toBe(once);
			}),
		);
	});
});

describe('compareDatesDescending properties', () => {
	it('compares a value to itself as equal', () => {
		fc.assert(
			fc.property(anyDate, (value) => {
				expect(compareDatesDescending(value, value)).toBe(0);
			}),
		);
	});

	it('is antisymmetric', () => {
		fc.assert(
			fc.property(anyDate, anyDate, (left, right) => {
				const forward = sign(compareDatesDescending(left, right));
				const backward = sign(compareDatesDescending(right, left));

				expect(forward + backward).toBe(0);
			}),
		);
	});

	it('is transitive', () => {
		fc.assert(
			fc.property(anyDate, anyDate, anyDate, (a, b, c) => {
				fc.pre(compareDatesDescending(a, b) <= 0 && compareDatesDescending(b, c) <= 0);

				expect(compareDatesDescending(a, c)).toBeLessThanOrEqual(0);
			}),
		);
	});

	it('sorts a later date before an earlier one', () => {
		fc.assert(
			fc.property(isoDate, isoDate, (left, right) => {
				fc.pre(Date.parse(left) !== Date.parse(right));
				const [earlier, later] =
					Date.parse(left) < Date.parse(right) ? [left, right] : [right, left];

				expect(compareDatesDescending(later, earlier)).toBeLessThan(0);
			}),
		);
	});

	it('sorts an unparseable date after every real one', () => {
		fc.assert(
			fc.property(isoDate, unparseable, (real, missing) => {
				expect(compareDatesDescending(real, missing)).toBeLessThan(0);
				expect(compareDatesDescending(missing, real)).toBeGreaterThan(0);
			}),
		);
	});
});
