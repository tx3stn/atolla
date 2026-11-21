import { describe, expect, it } from 'bun:test';
import type { LidarrAlbum } from './Models';
import {
	createUpcomingCardDetails,
	stillUpcoming,
	toUpcomingAlbums,
	type UpcomingAlbum,
} from './Upcoming';

const NOW = new Date(2026, 10, 21, 9, 30);

function lidarrAlbum(overrides: Partial<LidarrAlbum> = {}): LidarrAlbum {
	return {
		artist: { artistName: 'Converge' },
		id: 1,
		images: [{ coverType: 'cover', remoteUrl: 'https://covers.example/1.jpg' }],
		releaseDate: '2026-12-05T00:00:00Z',
		title: 'Axe to Fall',
		...overrides,
	};
}

describe('toUpcomingAlbums', () => {
	it('keeps what the home tab shows', () => {
		expect(toUpcomingAlbums([lidarrAlbum()])).toEqual([
			{
				artistName: 'Converge',
				coverUrl: 'https://covers.example/1.jpg',
				id: '1',
				releaseDate: '2026-12-05T00:00:00Z',
				title: 'Axe to Fall',
			},
		]);
	});

	it('takes the cover from the cover image, not the others', () => {
		const album = lidarrAlbum({
			images: [
				{ coverType: 'disc', remoteUrl: 'https://covers.example/disc.jpg' },
				{ coverType: 'cover', remoteUrl: 'https://covers.example/cover.jpg' },
			],
		});

		expect(toUpcomingAlbums([album])[0]?.coverUrl).toBe('https://covers.example/cover.jpg');
	});

	it('has no cover when lidarr has none', () => {
		expect(toUpcomingAlbums([lidarrAlbum({ images: [] })])[0]?.coverUrl).toBeUndefined();
	});

	it('drops an album without a title', () => {
		expect(toUpcomingAlbums([lidarrAlbum({ title: null })])).toEqual([]);
	});

	it('drops an album without an artist name', () => {
		expect(toUpcomingAlbums([lidarrAlbum({ artist: null })])).toEqual([]);
	});

	it('drops an album without a release date', () => {
		expect(toUpcomingAlbums([lidarrAlbum({ releaseDate: null })])).toEqual([]);
	});

	it('puts the soonest release first', () => {
		const later = lidarrAlbum({ id: 1, releaseDate: '2027-01-10T00:00:00Z' });
		const sooner = lidarrAlbum({ id: 2, releaseDate: '2026-11-25T00:00:00Z' });

		expect(toUpcomingAlbums([later, sooner]).map((album) => album.id)).toEqual(['2', '1']);
	});

	it('orders releases on the same day by artist', () => {
		const second = lidarrAlbum({ artist: { artistName: 'Petey' }, id: 1 });
		const first = lidarrAlbum({ artist: { artistName: 'Beecher' }, id: 2 });

		expect(toUpcomingAlbums([second, first]).map((album) => album.id)).toEqual(['2', '1']);
	});
});

describe('createUpcomingCardDetails', () => {
	const album: UpcomingAlbum = {
		artistName: 'Converge',
		coverUrl: 'https://covers.example/1.jpg',
		id: '1',
		releaseDate: '2026-12-05T00:00:00Z',
		title: 'Axe to Fall',
	};

	it('shows the release day, title and artist', () => {
		expect(createUpcomingCardDetails([album], 'en', NOW)).toEqual([
			{
				artworkKey: 'https://covers.example/1.jpg',
				id: 'lidarr-1',
				kind: 'album',
				lineOne: 'dateDayMonth 5th monthDecember',
				lineThree: 'Converge',
				lineTwo: 'Axe to Fall',
			},
		]);
	});

	it('writes the release day in the language given', () => {
		expect(createUpcomingCardDetails([album], 'fr', NOW)[0]?.lineOne).toBe(
			'dateDayMonth 5 monthDecember',
		);
	});

	it('says out today on the day it comes out', () => {
		const outToday = { ...album, releaseDate: '2026-11-21T00:00:00Z' };

		expect(createUpcomingCardDetails([outToday], 'en', NOW)[0]?.lineOne).toBe(
			'homeUpcomingOutToday',
		);
	});

	it('shows the release day for a release out tomorrow', () => {
		const outTomorrow = { ...album, releaseDate: '2026-11-22T00:00:00Z' };

		expect(createUpcomingCardDetails([outTomorrow], 'en', NOW)[0]?.lineOne).toBe(
			'dateDayMonth 22nd monthNovember',
		);
	});

	it('falls back to the placeholder artwork without a cover', () => {
		const withoutCover = { ...album, coverUrl: undefined };

		expect(createUpcomingCardDetails([withoutCover], 'en', NOW)[0]?.artworkKey).toBe('');
	});
});

describe('stillUpcoming', () => {
	const album: UpcomingAlbum = {
		artistName: 'Converge',
		id: '1',
		releaseDate: '2026-11-21T00:00:00Z',
		title: 'No Heroes',
	};

	it('keeps a release on the day it comes out', () => {
		expect(stillUpcoming([album], NOW)).toEqual([album]);
	});

	it('drops a release once its day has passed', () => {
		const nextDay = new Date(2026, 10, 22, 0, 5);

		expect(stillUpcoming([album], nextDay)).toEqual([]);
	});
});
