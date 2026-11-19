import { describe, expect, it } from 'bun:test';
import type { LidarrAlbum } from './Models';
import { toUpcomingAlbums } from './Upcoming';

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
