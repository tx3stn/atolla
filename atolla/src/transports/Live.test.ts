import { describe, expect, it } from 'bun:test';
import type {
	JellyfinAlbumItem,
	JellyfinArtistItem,
	JellyfinGenreItem,
	JellyfinListEnvelope,
	JellyfinPlaylistItem,
	JellyfinTrackItem,
} from '../models/jellyfin/Types';
import { LiveTransport, mapJellyfinArtistToArtist, mapJellyfinTrackToTrack } from './Live';

interface MockHTTPResponse {
	body?: Uint8Array;
	headers: Record<string, string>;
	statusCode: number;
}

function jsonResponse(statusCode: number, body: unknown): MockHTTPResponse {
	return {
		body: new TextEncoder().encode(JSON.stringify(body)),
		headers: {},
		statusCode,
	};
}

function listResponse<TItem>(
	items: Array<TItem>,
	totalRecordCount = items.length,
	startIndex = 0,
): JellyfinListEnvelope<TItem> {
	return {
		Items: items,
		StartIndex: startIndex,
		TotalRecordCount: totalRecordCount,
	};
}

function createHTTPClientFactory(responses: Array<MockHTTPResponse>) {
	const calls: Array<{
		baseUrl: string;
		headers?: Record<string, string>;
		method: 'get' | 'post';
		pathOrUrl: string;
	}> = [];

	return {
		calls,
		factory: (baseUrl: string) => ({
			get: (pathOrUrl: string, headers?: Record<string, string>) => {
				calls.push({ baseUrl, headers, method: 'get', pathOrUrl });
				const response = responses.shift();
				if (!response) {
					throw new Error('no queued response');
				}
				return Promise.resolve(response);
			},
			post: (pathOrUrl: string, _body?: Uint8Array, headers?: Record<string, string>) => {
				calls.push({ baseUrl, headers, method: 'post', pathOrUrl });
				const response = responses.shift();
				if (!response) {
					throw new Error('no queued response');
				}
				return Promise.resolve(response);
			},
		}),
	};
}

function queryParam(pathOrUrl: string, key: string): string | null {
	const url = new URL(pathOrUrl, 'https://atolla.test');
	return url.searchParams.get(key);
}

describe('mapJellyfinTrackToTrack', () => {
	it('maps release metadata from track item', () => {
		const item: JellyfinTrackItem = {
			Album: 'The Album',
			AlbumId: 'album-1',
			Id: 'track-1',
			Name: 'The Track',
			PremiereDate: '2020-04-20T00:00:00.0000000Z',
			ProductionYear: 2020,
			RunTimeTicks: 180_000_0000,
			Type: 'Audio',
		};

		const track = mapJellyfinTrackToTrack(item);

		expect(track.releaseDate).toBe('2020-04-20T00:00:00.0000000Z');
		expect(track.productionYear).toBe(2020);
	});
});

describe('mapJellyfinArtistToArtist', () => {
	it('omits logoUrl when artist has no logo metadata', () => {
		const item: JellyfinArtistItem = {
			Id: 'artist-1',
			Name: 'Artist A',
			Type: 'MusicArtist',
		};

		const artist = mapJellyfinArtistToArtist(item, {
			itemLogoImageUrl: (itemId: string, imageTag?: string): string =>
				`https://img/${itemId}/logo?tag=${imageTag ?? ''}`,
		});

		expect(artist.logoUrl).toBeUndefined();
	});
});

describe('LiveTransport core collections', () => {
	it('fetches albums page with paging query and hasMore', async () => {
		const album: JellyfinAlbumItem = {
			AlbumArtist: 'Artist A',
			Id: 'album-1',
			ImageTags: { Primary: 'cover-tag-1' },
			Name: 'Album A',
			Type: 'MusicAlbum',
		};
		const { calls, factory } = createHTTPClientFactory([
			jsonResponse(200, listResponse([album], 3, 0)),
		]);
		const transport = new LiveTransport('https://demo.jellyfin.local/', 'token-1', 'user-1', {
			httpClientFactory: factory,
		});

		const page = await transport.getAlbumsPage(1, 1);

		expect(calls).toHaveLength(1);
		expect(calls[0].baseUrl).toBe('https://demo.jellyfin.local');
		expect(queryParam(calls[0].pathOrUrl, 'startIndex')).toBe('0');
		expect(queryParam(calls[0].pathOrUrl, 'limit')).toBe('1');
		expect(queryParam(calls[0].pathOrUrl, 'includeItemTypes')).toBe('MusicAlbum');
		expect(queryParam(calls[0].pathOrUrl, 'userId')).toBe('user-1');
		expect(calls[0].headers?.['X-Emby-Token']).toBe('token-1');
		expect(page.hasMore).toBe(true);
		expect(page.items).toHaveLength(1);
		expect(page.items[0]).toEqual(
			expect.objectContaining({
				artistName: 'Artist A',
				id: 'album-1',
				name: 'Album A',
			}),
		);
		expect(page.items[0].imageUrl).toContain('/Items/album-1/Images/Primary');
		expect(page.items[0].imageUrl).toContain('api_key=token-1');
	});

	it('loads all artists through paginated /Items requests', async () => {
		const firstArtist: JellyfinArtistItem = {
			Id: 'artist-1',
			ImageTags: { Primary: 'artist-tag-1' },
			Name: 'Artist A',
			Type: 'MusicArtist',
		};
		const secondArtist: JellyfinArtistItem = {
			Id: 'artist-2',
			Name: 'Artist B',
			Type: 'MusicArtist',
		};
		const { calls, factory } = createHTTPClientFactory([
			jsonResponse(200, listResponse([firstArtist], 2, 0)),
			jsonResponse(200, listResponse([secondArtist], 2, 1)),
		]);
		const transport = new LiveTransport('https://demo.jellyfin.local', 'token-1', 'user-1', {
			httpClientFactory: factory,
		});

		const artists = await transport.getAllArtists();

		expect(calls).toHaveLength(2);
		expect(queryParam(calls[0].pathOrUrl, 'startIndex')).toBe('0');
		expect(queryParam(calls[0].pathOrUrl, 'limit')).toBe('100');
		expect(queryParam(calls[1].pathOrUrl, 'startIndex')).toBe('1');
		expect(artists.map((artist) => artist.id)).toEqual(['artist-1', 'artist-2']);
		expect(artists[0].imageUrl).toContain('/Items/artist-1/Images/Primary');
	});

	it('loads all playlists for home tab', async () => {
		const playlist: JellyfinPlaylistItem = {
			Id: 'playlist-1',
			ImageTags: { Primary: 'playlist-tag-1' },
			Name: 'Playlist A',
			Type: 'Playlist',
		};
		const { calls, factory } = createHTTPClientFactory([
			jsonResponse(200, listResponse([playlist], 1, 0)),
		]);
		const transport = new LiveTransport('https://demo.jellyfin.local', 'token-1', 'user-1', {
			httpClientFactory: factory,
		});

		const playlists = await transport.getAllPlaylists();

		expect(calls).toHaveLength(1);
		expect(queryParam(calls[0].pathOrUrl, 'includeItemTypes')).toBe('Playlist');
		expect(playlists).toHaveLength(1);
		expect(playlists[0]).toEqual(
			expect.objectContaining({
				id: 'playlist-1',
				name: 'Playlist A',
			}),
		);
		expect(playlists[0].imageUrl).toContain('/Items/playlist-1/Images/Primary');
	});

	it('fetches artists page with paging query and hasMore', async () => {
		const artist: JellyfinArtistItem = {
			Id: 'artist-1',
			Name: 'Artist A',
			Type: 'MusicArtist',
		};
		const { calls, factory } = createHTTPClientFactory([
			jsonResponse(200, listResponse([artist], 10, 3)),
		]);
		const transport = new LiveTransport('https://demo.jellyfin.local', 'token-1', 'user-1', {
			httpClientFactory: factory,
		});

		const page = await transport.getArtistsPage(2, 3);

		expect(calls).toHaveLength(1);
		expect(queryParam(calls[0].pathOrUrl, 'startIndex')).toBe('3');
		expect(queryParam(calls[0].pathOrUrl, 'limit')).toBe('3');
		expect(queryParam(calls[0].pathOrUrl, 'includeItemTypes')).toBe('MusicArtist');
		expect(page.hasMore).toBe(true);
		expect(page.items).toHaveLength(1);
		expect(page.items[0].id).toBe('artist-1');
	});

	it('fetches playlists page with paging query and hasMore', async () => {
		const playlist: JellyfinPlaylistItem = {
			Id: 'playlist-1',
			Name: 'Playlist A',
			Type: 'Playlist',
		};
		const { calls, factory } = createHTTPClientFactory([
			jsonResponse(200, listResponse([playlist], 3, 2)),
		]);
		const transport = new LiveTransport('https://demo.jellyfin.local', 'token-1', 'user-1', {
			httpClientFactory: factory,
		});

		const page = await transport.getPlaylistsPage(2, 2);

		expect(calls).toHaveLength(1);
		expect(queryParam(calls[0].pathOrUrl, 'startIndex')).toBe('2');
		expect(queryParam(calls[0].pathOrUrl, 'limit')).toBe('2');
		expect(queryParam(calls[0].pathOrUrl, 'includeItemTypes')).toBe('Playlist');
		expect(page.hasMore).toBe(false);
		expect(page.items).toHaveLength(1);
		expect(page.items[0].id).toBe('playlist-1');
	});

	it('fetches genres page using /MusicGenres query paging', async () => {
		const genre: JellyfinGenreItem = {
			Id: 'genre-1',
			ImageTags: { Primary: 'genre-tag-1' },
			Name: 'Noise Rock',
			Type: 'MusicGenre',
		};
		const { calls, factory } = createHTTPClientFactory([
			jsonResponse(200, listResponse([genre], 3, 2)),
		]);
		const transport = new LiveTransport('https://demo.jellyfin.local', 'token-1', 'user-1', {
			httpClientFactory: factory,
		});

		const page = await transport.getGenresPage(2, 2);

		expect(calls).toHaveLength(1);
		expect(calls[0].pathOrUrl.startsWith('/MusicGenres?')).toBe(true);
		expect(queryParam(calls[0].pathOrUrl, 'startIndex')).toBe('2');
		expect(queryParam(calls[0].pathOrUrl, 'limit')).toBe('2');
		expect(queryParam(calls[0].pathOrUrl, 'sortBy')).toBe('SortName');
		expect(queryParam(calls[0].pathOrUrl, 'sortOrder')).toBe('Ascending');
		expect(page.hasMore).toBe(false);
		expect(page.items).toHaveLength(1);
		expect(page.items[0]).toEqual(
			expect.objectContaining({
				id: 'genre-1',
				name: 'Noise Rock',
			}),
		);
		expect(page.items[0].imageUrl).toContain('/Items/genre-1/Images/Primary');
	});

	it('fetches artist top tracks sorted by play count', async () => {
		const firstTrack: JellyfinTrackItem = {
			ArtistItems: [{ Id: 'artist-1', Name: 'Artist A' }],
			Id: 'track-1',
			Name: 'Track One',
			RunTimeTicks: 120_000_000,
			Type: 'Audio',
		};
		const secondTrack: JellyfinTrackItem = {
			ArtistItems: [{ Id: 'artist-1', Name: 'Artist A' }],
			Id: 'track-2',
			Name: 'Track Two',
			RunTimeTicks: 180_000_000,
			Type: 'Audio',
		};
		const { calls, factory } = createHTTPClientFactory([
			jsonResponse(200, listResponse([firstTrack, secondTrack], 2, 0)),
		]);
		const transport = new LiveTransport('https://demo.jellyfin.local', 'token-1', 'user-1', {
			httpClientFactory: factory,
		});

		const tracks = await transport.getArtistTopTracks('artist-1');

		expect(calls).toHaveLength(1);
		expect(queryParam(calls[0].pathOrUrl, 'artistIds')).toBe('artist-1');
		expect(queryParam(calls[0].pathOrUrl, 'includeItemTypes')).toBe('Audio');
		expect(queryParam(calls[0].pathOrUrl, 'limit')).toBe('5');
		expect(queryParam(calls[0].pathOrUrl, 'sortBy')).toBe('PlayCount,SortName');
		expect(queryParam(calls[0].pathOrUrl, 'sortOrder')).toBe('Descending,Ascending');
		expect(tracks.map((track) => track.id)).toEqual(['track-1', 'track-2']);
	});

	it('returns null artist logo url when no logo metadata exists', async () => {
		const artist: JellyfinArtistItem = {
			Id: 'artist-1',
			Name: 'Artist A',
			Type: 'MusicArtist',
		};
		const { calls, factory } = createHTTPClientFactory([jsonResponse(200, artist)]);
		const transport = new LiveTransport('https://demo.jellyfin.local', 'token-1', 'user-1', {
			httpClientFactory: factory,
		});

		const logoUrl = await transport.getArtistLogoUrl('artist-1');

		expect(calls).toHaveLength(1);
		expect(calls[0].pathOrUrl).toContain('/Items/artist-1?');
		expect(logoUrl).toBeNull();
	});

	it('returns artist logo url when logo metadata exists', async () => {
		const artist: JellyfinArtistItem = {
			Id: 'artist-1',
			ImageTags: { Logo: 'logo-tag-1' },
			Name: 'Artist A',
			Type: 'MusicArtist',
		};
		const { factory } = createHTTPClientFactory([jsonResponse(200, artist)]);
		const transport = new LiveTransport('https://demo.jellyfin.local', 'token-1', 'user-1', {
			httpClientFactory: factory,
		});

		const logoUrl = await transport.getArtistLogoUrl('artist-1');

		expect(logoUrl).toContain('/Items/artist-1/Images/Logo');
		expect(logoUrl).toContain('tag=logo-tag-1');
	});

	it('builds a downloadable track cache url', () => {
		const { factory } = createHTTPClientFactory([]);
		const transport = new LiveTransport('https://demo.jellyfin.local', 'token-1', 'user-1', {
			httpClientFactory: factory,
		});

		const cacheUrl = transport.getTrackCacheUrl('track-123');

		expect(cacheUrl).toContain('/Audio/track-123/stream.mp3?');
		expect(cacheUrl).toContain('api_key=token-1');
		expect(cacheUrl).toContain('deviceId=atolla');
	});

	it('builds track cache url with configured device id', () => {
		const { factory } = createHTTPClientFactory([]);
		const transport = new LiveTransport('https://demo.jellyfin.local', 'token-1', 'user-1', {
			clientDeviceId: 'profile-2-device',
			httpClientFactory: factory,
		});

		const cacheUrl = transport.getTrackCacheUrl('track-123');

		expect(cacheUrl).toContain('deviceId=profile-2-device');
	});

	it('posts scrobble events with datePlayed', async () => {
		const { calls, factory } = createHTTPClientFactory([
			{ body: undefined, headers: {}, statusCode: 204 },
		]);
		const transport = new LiveTransport('https://demo.jellyfin.local', 'token-1', 'user-1', {
			httpClientFactory: factory,
		});

		await transport.scrobbleTrackPlayed('track-1', '2026-01-01T00:00:00.000Z');

		expect(calls).toHaveLength(1);
		expect(calls[0].method).toBe('post');
		expect(calls[0].pathOrUrl).toContain('/UserPlayedItems/track-1');
		expect(queryParam(calls[0].pathOrUrl, 'datePlayed')).toBe('2026-01-01T00:00:00.000Z');
		expect(queryParam(calls[0].pathOrUrl, 'userId')).toBe('user-1');
	});
});
