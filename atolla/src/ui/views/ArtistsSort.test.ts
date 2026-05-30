import { describe, expect, it } from 'bun:test';
import type { Artist } from '../../models/Artist';
import { ArtistSorts, sortArtists } from './ArtistsSort';

const artists: Array<Artist> = [
	{ dateAdded: '2024-01-02T00:00:00.000Z', id: '1', name: 'The Armed' },
	{ dateAdded: '2024-03-02T00:00:00.000Z', id: '2', name: 'Birds In Row' },
	{ dateAdded: '2024-02-02T00:00:00.000Z', id: '3', name: 'Converge' },
	{ id: '4', name: 'Agriculture' },
];

describe('sortArtists', () => {
	it('sorts artists a-z with leading The normalized', () => {
		const sorted = sortArtists(artists, ArtistSorts.aToZ);

		expect(sorted.map((artist) => artist.name)).toEqual([
			'Agriculture',
			'The Armed',
			'Birds In Row',
			'Converge',
		]);
	});

	it('sorts artists z-a with leading The normalized', () => {
		const sorted = sortArtists(artists, ArtistSorts.zToA);

		expect(sorted.map((artist) => artist.name)).toEqual([
			'Converge',
			'Birds In Row',
			'The Armed',
			'Agriculture',
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

		const sorted = sortArtists(mixedCase, ArtistSorts.aToZ);

		expect(sorted.map((artist) => artist.name)).toEqual([
			'aardvark',
			'apple',
			'Banana',
			'beta',
			'Zebra',
		]);
	});

	it('sorts artists new-old by dateAdded and puts missing dates last', () => {
		const sorted = sortArtists(artists, ArtistSorts.newToOld);

		expect(sorted.map((artist) => artist.name)).toEqual([
			'Birds In Row',
			'Converge',
			'The Armed',
			'Agriculture',
		]);
	});

	it('sorts artists old-new by dateAdded and puts missing dates last', () => {
		const sorted = sortArtists(artists, ArtistSorts.oldToNew);

		expect(sorted.map((artist) => artist.name)).toEqual([
			'The Armed',
			'Converge',
			'Birds In Row',
			'Agriculture',
		]);
	});
});
