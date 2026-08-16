import { describe, expect, it } from 'bun:test';
import type { Artist } from 'atolla_core/src/models/Artist';
import { sortArtists } from './Artists';

const artists: Array<Artist> = [
	{ dateAdded: '2024-01-02T00:00:00.000Z', id: '1', name: 'The Armed' },
	{ dateAdded: '2024-03-02T00:00:00.000Z', id: '2', name: 'Birds In Row' },
	{ dateAdded: '2024-02-02T00:00:00.000Z', id: '3', name: 'Converge' },
	{ id: '4', name: 'Agriculture' },
];

describe('sortArtists', () => {
	it('sorts artists a-z with leading The normalized', () => {
		const sorted = sortArtists(artists);

		expect(sorted.map((artist) => artist.name)).toEqual([
			'Agriculture',
			'The Armed',
			'Birds In Row',
			'Converge',
		]);
	});

	it('sorts artists a-z regardless of case', () => {
		const mixedCase: Array<Artist> = [
			{ id: '1', name: 'Zebra' },
			{ id: '2', name: 'apple' },
			{ id: '3', name: 'Banana' },
			{ id: '4', name: 'aardvark' },
			{ id: '5', name: 'beta' },
		];

		const sorted = sortArtists(mixedCase);

		expect(sorted.map((artist) => artist.name)).toEqual([
			'aardvark',
			'apple',
			'Banana',
			'beta',
			'Zebra',
		]);
	});

	it('leaves the source array untouched', () => {
		const source: Array<Artist> = [
			{ id: '1', name: 'Zao' },
			{ id: '2', name: 'Amenra' },
		];

		sortArtists(source);

		expect(source.map((artist) => artist.name)).toEqual(['Zao', 'Amenra']);
	});
});
