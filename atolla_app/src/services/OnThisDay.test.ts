import { describe, expect, it } from 'bun:test';
import type { Album } from '../models/Album';
import { createOnThisDayCardDetails, matchOnThisDay } from './OnThisDay';

function album(overrides: Partial<Album>): Album {
	return {
		artistId: 'artist-1',
		artistName: 'Artist One',
		id: 'album-1',
		name: 'Album One',
		...overrides,
	};
}

const today = new Date(2024, 5, 15); // 15 June 2024, local

describe('matchOnThisDay', () => {
	it('matches the same month/day in an earlier year', () => {
		const result = matchOnThisDay('2001-06-15T12:00:00Z', today);
		expect(result).not.toBeNull();
		expect(result?.year).toBe(2001);
	});

	it('matches a UTC PremiereDate on its calendar day for a viewer west of UTC', () => {
		const originalTz = process.env.TZ;
		process.env.TZ = 'America/Los_Angeles';
		try {
			const todayInLa = new Date(2026, 8, 24); // 24 Sep 2026, local (Los Angeles)
			const result = matchOnThisDay('1991-09-24T00:00:00.0000000Z', todayInLa);
			expect(result).not.toBeNull();
			expect(result?.year).toBe(1991);
		} finally {
			process.env.TZ = originalTz;
		}
	});

	it('returns null when there is no release date', () => {
		expect(matchOnThisDay(undefined, today)).toBeNull();
		expect(matchOnThisDay('', today)).toBeNull();
	});

	it('returns null for an unparseable date', () => {
		expect(matchOnThisDay('not-a-date', today)).toBeNull();
	});

	it('returns null for the current or a future year (no anniversary yet)', () => {
		expect(matchOnThisDay('2024-06-15T12:00:00Z', today)).toBeNull();
		expect(matchOnThisDay('2030-06-15T12:00:00Z', today)).toBeNull();
	});

	it('returns null when the month or day differs', () => {
		expect(matchOnThisDay('2010-06-16T12:00:00Z', today)).toBeNull();
		expect(matchOnThisDay('2010-07-15T12:00:00Z', today)).toBeNull();
	});
});

describe('createOnThisDayCardDetails', () => {
	it('builds anniversary cards sorted oldest-first with years-ago text', () => {
		const albums: Array<Album> = [
			album({ id: 'c', name: 'Charlie', releaseDate: '2023-06-15T12:00:00Z' }),
			album({
				id: 'a',
				imageUrl: 'http://img/a',
				name: 'Bravo',
				releaseDate: '2001-06-15T12:00:00Z',
			}),
			album({ id: 'b', name: 'Alpha', releaseDate: '2010-06-15T12:00:00Z' }),
		];

		const cards = createOnThisDayCardDetails(albums, today);

		expect(cards.map((c) => c.id)).toEqual(['a', 'b', 'c']);
		expect(cards[0]).toEqual({
			artworkKey: 'http://img/a',
			id: 'a',
			kind: 'album',
			lineOne: '23 YEARS AGO',
			lineThree: 'Artist One',
			lineTwo: 'Bravo',
		});
		expect(cards[1].lineOne).toBe('14 YEARS AGO');
		expect(cards[1].artworkKey).toBe('');
	});

	it('uses singular YEAR for a one-year anniversary', () => {
		const cards = createOnThisDayCardDetails(
			[album({ releaseDate: '2023-06-15T12:00:00Z' })],
			today,
		);
		expect(cards[0]?.lineOne).toBe('1 YEAR AGO');
	});

	it('breaks ties within a year by album name', () => {
		const albums: Array<Album> = [
			album({ id: 'z', name: 'Zebra', releaseDate: '2010-06-15T12:00:00Z' }),
			album({ id: 'm', name: 'Mango', releaseDate: '2010-06-15T12:00:00Z' }),
		];
		expect(createOnThisDayCardDetails(albums, today).map((c) => c.id)).toEqual(['m', 'z']);
	});

	it('skips non-matching, blank, and missing-date albums without throwing', () => {
		const albums: Array<Album> = [
			album({ id: 'future', releaseDate: '2024-06-15T12:00:00Z' }),
			album({ id: 'wrong-day', releaseDate: '2010-06-16T12:00:00Z' }),
			album({ id: 'no-date' }),
			album({ id: 'blank-name', name: '   ', releaseDate: '2010-06-15T12:00:00Z' }),
			album({ artistName: '', id: 'blank-artist', releaseDate: '2010-06-15T12:00:00Z' }),
			// name intentionally absent at runtime: must be skipped, not throw
			album({
				id: 'null-name',
				name: undefined as unknown as string,
				releaseDate: '2010-06-15T12:00:00Z',
			}),
		];

		expect(createOnThisDayCardDetails(albums, today)).toEqual([]);
	});
});
