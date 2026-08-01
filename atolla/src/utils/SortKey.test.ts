import { describe, expect, it } from 'bun:test';
import fc from 'fast-check';
import { compareBySortKey, matchesLetterFilter, type Sortable, sortKey } from './SortKey';

const LETTER_BUCKETS = ['0', ...'abcdefghijklmnopqrstuvwxyz'.split('')];

const name = fc.oneof(
	fc.string({ maxLength: 20, minLength: 1 }),
	fc.constantFrom(
		'The Beatles',
		'Beatles',
		'MØL',
		'Ärzte',
		'65daysofstatic',
		'A Perfect Circle',
		'the the',
	),
);

const sortable: fc.Arbitrary<Sortable> = fc.record(
	{ name, sortName: fc.option(name, { nil: undefined }) },
	{ requiredKeys: ['name'] },
);

function sign(value: number): number {
	return value < 0 ? -1 : value > 0 ? 1 : 0;
}

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

	it('collects names starting with a symbol under the 0 bucket rather than dropping them', () => {
		expect(matchesLetterFilter({ name: '!!!', sortName: '!!!' }, '0')).toBe(true);
		expect(matchesLetterFilter({ name: '¡Forward, Russia!' }, '0')).toBe(true);
	});
});

describe('compareBySortKey properties', () => {
	it('compares an item to itself as equal', () => {
		fc.assert(
			fc.property(sortable, (item) => {
				expect(compareBySortKey(item, item)).toBe(0);
			}),
		);
	});

	it('is antisymmetric', () => {
		fc.assert(
			fc.property(sortable, sortable, (left, right) => {
				const forward = sign(compareBySortKey(left, right));
				const backward = sign(compareBySortKey(right, left));

				expect(forward + backward).toBe(0);
			}),
		);
	});

	it('is transitive', () => {
		fc.assert(
			fc.property(sortable, sortable, sortable, (a, b, c) => {
				fc.pre(compareBySortKey(a, b) <= 0 && compareBySortKey(b, c) <= 0);

				expect(compareBySortKey(a, c)).toBeLessThanOrEqual(0);
			}),
		);
	});

	it('leaves an already-sorted list unchanged', () => {
		fc.assert(
			fc.property(fc.array(sortable, { maxLength: 12 }), (items) => {
				const once = [...items].sort(compareBySortKey);
				const twice = [...once].sort(compareBySortKey);

				expect(twice.map(sortKey)).toEqual(once.map(sortKey));
			}),
		);
	});
});

describe('matchesLetterFilter properties', () => {
	it('puts every item in exactly one bucket', () => {
		fc.assert(
			fc.property(sortable, (item) => {
				const matched = LETTER_BUCKETS.filter((letter) => matchesLetterFilter(item, letter));

				expect(matched.length).toBe(1);
			}),
		);
	});
});
