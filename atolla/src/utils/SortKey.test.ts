import { describe, expect, it } from 'bun:test';
import { compareBySortKey, matchesLetterFilter, sortKey } from './SortKey';

describe('sortKey', () => {
	it('prefers the sort key the server computed', () => {
		expect(sortKey({ name: 'The Beatles', sortName: 'beatles' })).toBe('beatles');
	});

	it('falls back to the name with a leading article stripped', () => {
		expect(sortKey({ name: '  The Beatles ' })).toBe('beatles');
	});

	it('ignores an empty sort name', () => {
		expect(sortKey({ name: 'Boards of Canada', sortName: '   ' })).toBe('boards of canada');
	});
});

describe('compareBySortKey', () => {
	function sorted(items: Array<{ name: string; sortName?: string }>): Array<string> {
		return [...items].sort(compareBySortKey).map((item) => item.name);
	}

	it('orders by the server key even where it disagrees with the display name', () => {
		expect(
			sorted([
				{ name: 'NNAMDÏ', sortName: 'nnamdï' },
				{ name: 'A Perfect Circle', sortName: 'perfect circle' },
				{ name: 'Alcest', sortName: 'alcest' },
				{ name: 'MØL', sortName: 'møl' },
			]),
		).toEqual(['Alcest', 'MØL', 'NNAMDÏ', 'A Perfect Circle']);
	});

	it('interleaves items that have no stored key with those that do', () => {
		expect(
			sorted([
				{ name: 'Deafheaven' },
				{ name: 'Alcest', sortName: 'alcest' },
				{ name: 'The Cure' },
				{ name: 'Boris', sortName: 'boris' },
			]),
		).toEqual(['Alcest', 'Boris', 'The Cure', 'Deafheaven']);
	});

	it('breaks a tie on the display name so the order is stable', () => {
		expect(
			sorted([
				{ name: 'The Beatles', sortName: 'beatles' },
				{ name: 'Beatles', sortName: 'beatles' },
			]),
		).toEqual(['Beatles', 'The Beatles']);
	});
});

describe('matchesLetterFilter', () => {
	it('buckets a non-ascii name under its own letter', () => {
		expect(matchesLetterFilter({ name: 'MØL', sortName: 'møl' }, 'M')).toBe(true);
		expect(matchesLetterFilter({ name: 'MØL', sortName: 'møl' }, 'N')).toBe(false);
	});

	it('buckets on the sort key so a leading article does not decide the letter', () => {
		expect(matchesLetterFilter({ name: 'The Cure', sortName: 'cure' }, 'C')).toBe(true);
		expect(matchesLetterFilter({ name: 'The Cure', sortName: 'cure' }, 'T')).toBe(false);
	});

	it('buckets names with no stored key on the fallback', () => {
		expect(matchesLetterFilter({ name: 'The Cure' }, 'C')).toBe(true);
	});

	it('collects everything starting with a digit under the 0 bucket', () => {
		expect(matchesLetterFilter({ name: '65daysofstatic', sortName: '65daysofstatic' }, '0')).toBe(
			true,
		);
		expect(matchesLetterFilter({ name: 'Alcest', sortName: 'alcest' }, '0')).toBe(false);
	});
});
