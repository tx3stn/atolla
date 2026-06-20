import { describe, expect, it } from 'bun:test';
import type { Album } from '../models/Album';
import { RecentlyAddedService } from './RecentlyAddedService';

class FakeStore {
	lastKey = '';
	value = '';

	fetchString(): Promise<string> {
		return Promise.resolve(this.value);
	}

	storeString(key: string, value: string): Promise<void> {
		this.lastKey = key;
		this.value = value;
		return Promise.resolve();
	}
}

const sampleAlbums: Array<Album> = [
	{
		artistId: 'artist-1',
		artistName: 'Artist One',
		id: 'album-1',
		imageUrl: 'https://example.com/album-1.jpg',
		name: 'Album One',
		releaseDate: '2001-01-01',
	},
	{
		artistId: 'artist-2',
		artistName: 'Artist Two',
		id: 'album-2',
		name: 'Album Two',
	},
];

describe('RecentlyAddedService', () => {
	describe('loadCached', () => {
		it('returns an empty list when nothing is cached', async () => {
			const service = new RecentlyAddedService(new FakeStore());
			expect(await service.loadCached()).toEqual([]);
		});

		it('parses legacy array payloads', async () => {
			const store = new FakeStore();
			store.value = JSON.stringify(sampleAlbums);
			const service = new RecentlyAddedService(store);

			expect(await service.loadCached()).toEqual(sampleAlbums);
		});

		it('returns an empty list for invalid payloads', async () => {
			const invalidPayloads = [
				'not-json',
				JSON.stringify({ albums: [{ id: 'bad' }] }),
				JSON.stringify({ invalid: true }),
			];

			for (const raw of invalidPayloads) {
				const store = new FakeStore();
				store.value = raw;
				const service = new RecentlyAddedService(store);

				expect(await service.loadCached()).toEqual([]);
			}
		});
	});

	describe('refresh', () => {
		it('forwards the limit and returns the transport albums', async () => {
			let requestedLimit = 0;
			const service = new RecentlyAddedService(new FakeStore());

			const albums = await service.refresh(
				{
					getRecentlyAddedAlbums: (limit: number) => {
						requestedLimit = limit;
						return Promise.resolve(sampleAlbums);
					},
				},
				12,
			);

			expect(requestedLimit).toBe(12);
			expect(albums).toEqual(sampleAlbums);
		});

		it('persists fetched albums so loadCached returns them with genres intact', async () => {
			const store = new FakeStore();
			const service = new RecentlyAddedService(store);
			const withGenres: Array<Album> = [
				{ ...sampleAlbums[0], genres: [{ id: 'genre-1', name: 'Post-Hardcore' }] },
			];

			await service.refresh({ getRecentlyAddedAlbums: () => Promise.resolve(withGenres) }, 6);

			expect(await service.loadCached()).toEqual(withGenres);
		});

		it('rejects when the transport fails so the caller keeps the existing list', async () => {
			const service = new RecentlyAddedService(new FakeStore());

			await expect(
				service.refresh(
					{ getRecentlyAddedAlbums: () => Promise.reject(new Error('network failure')) },
					6,
				),
			).rejects.toThrow('network failure');
		});
	});
});
