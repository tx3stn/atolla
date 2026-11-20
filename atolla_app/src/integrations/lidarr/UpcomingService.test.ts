import { describe, expect, it } from 'bun:test';
import { InMemoryKeyValueStore, type KeyValueStore } from 'atolla_core/src/stores/KeyValueStore';
import type { HttpResponse, HttpTransport } from 'atolla_sync/src/api/Transport';
import { IntegrationErrors } from '../IntegrationErrors';
import { LidarrClient } from './Client';
import type { LidarrAlbum } from './Models';
import { UpcomingService } from './UpcomingService';

const NOW = new Date(2026, 10, 19, 15, 30);

function lidarrAlbum(overrides: Partial<LidarrAlbum> = {}): LidarrAlbum {
	return {
		artist: { artistName: 'Converge' },
		id: 1,
		images: [],
		releaseDate: '2026-12-05T00:00:00Z',
		title: 'Axe to Fall',
		...overrides,
	};
}

function lidarr(albums: Array<LidarrAlbum>) {
	const urls: Array<string> = [];
	const response: HttpResponse = {
		body: new TextEncoder().encode(JSON.stringify(albums)),
		headers: {},
		statusCode: 200,
	};
	const transport: HttpTransport = {
		get: (url) => {
			urls.push(url);
			return Promise.resolve(response);
		},
		post: () => Promise.reject(new Error('unused')),
		put: () => Promise.reject(new Error('unused')),
	};

	return { client: new LidarrClient(transport, 'http://lidarr.local:8686', 'key-1'), urls };
}

function unreachableLidarr(): LidarrClient {
	const transport: HttpTransport = {
		get: () => Promise.reject(new Error('connection refused')),
		post: () => Promise.reject(new Error('unused')),
		put: () => Promise.reject(new Error('unused')),
	};

	return new LidarrClient(transport, 'http://lidarr.local:8686', 'key-1');
}

describe('UpcomingService', () => {
	it('asks lidarr for the next ninety days from the start of today', async () => {
		const { client, urls } = lidarr([]);

		await new UpcomingService(new InMemoryKeyValueStore()).refresh(client, NOW);

		expect(urls).toEqual([
			'http://lidarr.local:8686/api/v1/calendar?start=2026-11-19T00%3A00%3A00.000Z&end=2027-02-17T00%3A00%3A00.000Z&includeArtist=true',
		]);
	});

	it('shows what lidarr has coming', async () => {
		const { client } = lidarr([lidarrAlbum()]);
		const upcoming = new UpcomingService(new InMemoryKeyValueStore());

		await upcoming.refresh(client, NOW);

		expect(upcoming.albums(NOW).map((album) => album.title)).toEqual(['Axe to Fall']);
	});

	it('keeps the list for the next launch', async () => {
		const { client } = lidarr([lidarrAlbum()]);
		const store = new InMemoryKeyValueStore();
		await new UpcomingService(store).refresh(client, NOW);
		const nextLaunch = new UpcomingService(store);

		await nextLaunch.ensureLoaded();

		expect(nextLaunch.albums(NOW).map((album) => album.title)).toEqual(['Axe to Fall']);
	});

	it('leaves out albums released before today', async () => {
		const { client } = lidarr([
			lidarrAlbum({ id: 1, releaseDate: '2026-11-18T00:00:00Z', title: 'Jane Doe' }),
			lidarrAlbum({ id: 2, releaseDate: '2026-11-19T00:00:00Z', title: 'Axe to Fall' }),
		]);
		const upcoming = new UpcomingService(new InMemoryKeyValueStore());

		await upcoming.refresh(client, NOW);

		expect(upcoming.albums(NOW).map((album) => album.title)).toEqual(['Axe to Fall']);
	});

	it('keeps the last list when lidarr cannot be reached', async () => {
		const { client } = lidarr([lidarrAlbum()]);
		const upcoming = new UpcomingService(new InMemoryKeyValueStore());
		await upcoming.refresh(client, NOW);

		await expect(upcoming.refresh(unreachableLidarr(), NOW)).rejects.toEqual(
			IntegrationErrors.UNREACHABLE.withDetail('Error: connection refused'),
		);
		expect(upcoming.albums(NOW).map((album) => album.title)).toEqual(['Axe to Fall']);
	});

	it('keeps the fresh list in memory when it cannot be saved', async () => {
		const { client } = lidarr([lidarrAlbum()]);
		const failure = new Error('disk full');
		const store: KeyValueStore = {
			fetchString: () => Promise.reject(new Error('missing key')),
			storeString: () => Promise.reject(failure),
		};
		const upcoming = new UpcomingService(store);

		await expect(upcoming.refresh(client, NOW)).rejects.toBe(failure);
		expect(upcoming.albums(NOW).map((album) => album.title)).toEqual(['Axe to Fall']);
	});

	it('forgets the list when cleared', async () => {
		const { client } = lidarr([lidarrAlbum()]);
		const store = new InMemoryKeyValueStore();
		const upcoming = new UpcomingService(store);
		await upcoming.refresh(client, NOW);

		await upcoming.clear();
		const nextLaunch = new UpcomingService(store);
		await nextLaunch.ensureLoaded();

		expect(upcoming.albums(NOW)).toEqual([]);
		expect(nextLaunch.albums(NOW)).toEqual([]);
	});

	it('starts empty when nothing was saved', async () => {
		const upcoming = new UpcomingService(new InMemoryKeyValueStore());

		await upcoming.ensureLoaded();

		expect(upcoming.albums(NOW)).toEqual([]);
	});

	it('starts empty when the saved list cannot be read', async () => {
		const store = new InMemoryKeyValueStore();
		await store.storeString('upcoming_v1', '{not json');
		const upcoming = new UpcomingService(store);

		await upcoming.ensureLoaded();

		expect(upcoming.albums(NOW)).toEqual([]);
	});
});
