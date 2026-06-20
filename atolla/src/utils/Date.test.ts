import { describe, expect, it } from 'bun:test';
import { formatReleaseDate } from './Date';

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
