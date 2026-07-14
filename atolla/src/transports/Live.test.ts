import { describe, expect, it } from 'bun:test';
import type { IHTTPClient } from 'valdi_http/src/IHTTPClient';
import type {
	JellyfinAlbumItem,
	JellyfinArtistItem,
	JellyfinGenreItem,
	JellyfinListEnvelope,
	JellyfinPlaylistItem,
	JellyfinTrackItem,
} from '../models/jellyfin/Types';
import {
	LiveTransport,
	mapJellyfinAlbumToAlbum,
	mapJellyfinArtistToArtist,
	mapJellyfinPlaylistToPlaylist,
	mapJellyfinTrackToTrack,
	resolveAlbumArtist,
	resolvePrimaryArtist,
} from './Live';

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

function createHTTPClient(responses: Array<MockHTTPResponse>) {
	const calls: Array<{
		body?: Uint8Array;
		headers?: Record<string, string>;
		method: 'delete' | 'get' | 'post';
		pathOrUrl: string;
	}> = [];

	const next = () => {
		const response = responses.shift();
		if (!response) {
			throw new Error('no queued response');
		}
		return Promise.resolve(response);
	};

	const client = {
		delete: (pathOrUrl: string, headers?: Record<string, string>) => {
			calls.push({ headers, method: 'delete', pathOrUrl });
			return next();
		},
		get: (pathOrUrl: string, headers?: Record<string, string>) => {
			calls.push({ headers, method: 'get', pathOrUrl });
			return next();
		},
		post: (pathOrUrl: string, body?: Uint8Array, headers?: Record<string, string>) => {
			calls.push({ body, headers, method: 'post', pathOrUrl });
			return next();
		},
	};

	return { calls, client: client as unknown as IHTTPClient };
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

	it('maps track genres from genre references', () => {
		const item: JellyfinTrackItem = {
			GenreItems: [
				{ Id: 'genre-2', Name: 'Noise Rock' },
				{ Id: 'genre-1', Name: 'Post-Hardcore' },
			],
			Id: 'track-1',
			Name: 'The Track',
			RunTimeTicks: 180_000_0000,
			Type: 'Audio',
		};

		const track = mapJellyfinTrackToTrack(item);

		expect(track.genres).toEqual([
			{ id: 'genre-2', name: 'Noise Rock' },
			{ id: 'genre-1', name: 'Post-Hardcore' },
		]);
	});
});

describe('mapJellyfinArtistToArtist', () => {
	it('maps dateAdded from DateCreated', () => {
		const item: JellyfinArtistItem = {
			DateCreated: '2024-02-11T00:00:00.000Z',
			Id: 'artist-1',
			Name: 'Artist A',
			Type: 'MusicArtist',
		};

		const artist = mapJellyfinArtistToArtist(item);

		expect(artist.dateAdded).toBe('2024-02-11T00:00:00.000Z');
	});

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

	it('maps artist genres from genre references', () => {
		const item: JellyfinArtistItem = {
			GenreItems: [
				{ Id: 'genre-2', Name: 'Noise Rock' },
				{ Id: 'genre-1', Name: 'Post-Hardcore' },
			],
			Id: 'artist-1',
			Name: 'Artist A',
			Type: 'MusicArtist',
		};

		const artist = mapJellyfinArtistToArtist(item);

		expect(artist.genres).toEqual([
			{ id: 'genre-2', name: 'Noise Rock' },
			{ id: 'genre-1', name: 'Post-Hardcore' },
		]);
	});
});

describe('mapJellyfinPlaylistToPlaylist', () => {
	it('maps dateAdded from DateCreated', () => {
		const item: JellyfinPlaylistItem = {
			DateCreated: '2024-03-08T00:00:00.000Z',
			Id: 'playlist-1',
			Name: 'Playlist A',
			Type: 'Playlist',
		};

		const playlist = mapJellyfinPlaylistToPlaylist(item);

		expect(playlist.dateAdded).toBe('2024-03-08T00:00:00.000Z');
	});
});

describe('mapJellyfinAlbumToAlbum', () => {
	it('maps album genres from genre references', () => {
		const item: JellyfinAlbumItem = {
			AlbumArtist: 'Artist A',
			GenreItems: [
				{ Id: 'genre-2', Name: 'Noise Rock' },
				{ Id: 'genre-1', Name: 'Post-Hardcore' },
			],
			Id: 'album-1',
			Name: 'Album A',
			Type: 'MusicAlbum',
		};

		const album = mapJellyfinAlbumToAlbum(item);

		expect(album.genres).toEqual([
			{ id: 'genre-2', name: 'Noise Rock' },
			{ id: 'genre-1', name: 'Post-Hardcore' },
		]);
	});

	it('uses AlbumArtists over ArtistItems for album artist', () => {
		const item: JellyfinAlbumItem = {
			AlbumArtists: [{ Id: 'album-artist-1', Name: 'Various Artists' }],
			ArtistItems: [{ Id: 'track-artist-1', Name: 'First Track Artist' }],
			Id: 'album-1',
			Name: 'Compilation',
			Type: 'MusicAlbum',
		};

		const album = mapJellyfinAlbumToAlbum(item);

		expect(album.artistId).toBe('album-artist-1');
		expect(album.artistName).toBe('Various Artists');
	});
});

describe('resolveAlbumArtist', () => {
	it('returns AlbumArtists[0] when present', () => {
		const item = {
			AlbumArtist: 'Fallback',
			AlbumArtists: [{ Id: 'a-1', Name: 'Album Artist' }],
			ArtistItems: [{ Id: 'a-2', Name: 'Track Artist' }],
		};
		const result = resolveAlbumArtist(item);
		expect(result?.Id).toBe('a-1');
		expect(result?.Name).toBe('Album Artist');
	});

	it('falls back to ArtistItems[0] when AlbumArtists is absent', () => {
		const item = {
			ArtistItems: [{ Id: 'a-2', Name: 'Track Artist' }],
		};
		const result = resolveAlbumArtist(item);
		expect(result?.Id).toBe('a-2');
		expect(result?.Name).toBe('Track Artist');
	});

	it('falls back to AlbumArtist string when neither array has a valid entry', () => {
		const item = { AlbumArtist: 'String Artist' };
		const result = resolveAlbumArtist(item);
		expect(result?.Name).toBe('String Artist');
	});
});

describe('resolvePrimaryArtist', () => {
	it('returns ArtistItems[0] first (track artist takes precedence)', () => {
		const item = {
			AlbumArtist: 'Fallback',
			AlbumArtists: [{ Id: 'a-1', Name: 'Album Artist' }],
			ArtistItems: [{ Id: 'a-2', Name: 'Track Artist' }],
		};
		const result = resolvePrimaryArtist(item);
		expect(result?.Id).toBe('a-2');
		expect(result?.Name).toBe('Track Artist');
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
		const { calls, client } = createHTTPClient([jsonResponse(200, listResponse([album], 3, 0))]);
		const transport = new LiveTransport(
			'https://demo.jellyfin.local/',
			'token-1',
			'user-1',
			client,
		);

		const page = await transport.getAlbums(1, 1);

		expect(calls).toHaveLength(1);
		expect(queryParam(calls[0].pathOrUrl, 'startIndex')).toBe('0');
		expect(queryParam(calls[0].pathOrUrl, 'limit')).toBe('1');
		expect(queryParam(calls[0].pathOrUrl, 'fields')).toBe('Overview,Genres');
		expect(queryParam(calls[0].pathOrUrl, 'includeItemTypes')).toBe('MusicAlbum');
		expect(queryParam(calls[0].pathOrUrl, 'sortBy')).toBe('PremiereDate,SortName');
		expect(queryParam(calls[0].pathOrUrl, 'sortOrder')).toBe('Descending,Ascending');
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
		expect(page.items[0].imageUrl).not.toContain('api_key');
	});

	it('fetches a minimal album release-dates page (no Overview, images/userData disabled)', async () => {
		const album: JellyfinAlbumItem = {
			Id: 'album-9',
			Name: 'Album Nine',
			PremiereDate: '2001-06-15T00:00:00.0000000Z',
			Type: 'MusicAlbum',
		};
		const { calls, client } = createHTTPClient([jsonResponse(200, listResponse([album], 5, 0))]);
		const transport = new LiveTransport('https://demo.jellyfin.local', 'token-1', 'user-1', client);

		const page = await transport.getAlbumReleaseDates(1, 2);

		expect(calls).toHaveLength(1);
		expect(queryParam(calls[0].pathOrUrl, 'startIndex')).toBe('0');
		expect(queryParam(calls[0].pathOrUrl, 'limit')).toBe('2');
		expect(queryParam(calls[0].pathOrUrl, 'includeItemTypes')).toBe('MusicAlbum');
		expect(queryParam(calls[0].pathOrUrl, 'sortBy')).toBe('PremiereDate');
		expect(queryParam(calls[0].pathOrUrl, 'enableImages')).toBe('false');
		expect(queryParam(calls[0].pathOrUrl, 'enableUserData')).toBe('false');
		// minimal projection: the heavy Overview/Genres fields must not be requested
		expect(queryParam(calls[0].pathOrUrl, 'fields')).toBeNull();
		expect(page.hasMore).toBe(true);
		expect(page.items).toEqual([{ id: 'album-9', releaseDate: '2001-06-15T00:00:00.0000000Z' }]);
	});

	it('hydrates albums by id in a single ids= request', async () => {
		const albumA: JellyfinAlbumItem = { Id: 'a', Name: 'A', Type: 'MusicAlbum' };
		const albumB: JellyfinAlbumItem = { Id: 'b', Name: 'B', Type: 'MusicAlbum' };
		const { calls, client } = createHTTPClient([
			jsonResponse(200, listResponse([albumA, albumB], 2, 0)),
		]);
		const transport = new LiveTransport('https://demo.jellyfin.local', 'token-1', 'user-1', client);

		const albums = await transport.getAlbumsByIds(['a', 'b']);

		expect(calls).toHaveLength(1);
		expect(queryParam(calls[0].pathOrUrl, 'ids')).toBe('a,b');
		expect(queryParam(calls[0].pathOrUrl, 'includeItemTypes')).toBe('MusicAlbum');
		expect(albums.map((album) => album.id)).toEqual(['a', 'b']);
	});

	it('returns no albums and makes no request for an empty id list', async () => {
		const { calls, client } = createHTTPClient([]);
		const transport = new LiveTransport('https://demo.jellyfin.local', 'token-1', 'user-1', client);

		expect(await transport.getAlbumsByIds([])).toEqual([]);
		expect(calls).toHaveLength(0);
	});

	it('maps a letter startsWith filter to nameStartsWith on the albums page query', async () => {
		const album: JellyfinAlbumItem = {
			AlbumArtist: 'Artist A',
			Id: 'album-1',
			Name: 'Album A',
			Type: 'MusicAlbum',
		};
		const { calls, client } = createHTTPClient([jsonResponse(200, listResponse([album], 1, 0))]);
		const transport = new LiveTransport('https://demo.jellyfin.local', 'token-1', 'user-1', client);

		await transport.getAlbums(1, 50, { startsWith: 'a' });

		expect(calls).toHaveLength(1);
		expect(queryParam(calls[0].pathOrUrl, 'nameStartsWith')).toBe('a');
		expect(queryParam(calls[0].pathOrUrl, 'nameLessThan')).toBeNull();
	});

	it('maps the digit startsWith bucket to nameLessThan=A on the artists page query', async () => {
		const artist: JellyfinArtistItem = {
			Id: 'artist-1',
			Name: '5 Seconds',
			Type: 'MusicArtist',
		};
		const { calls, client } = createHTTPClient([jsonResponse(200, listResponse([artist], 1, 0))]);
		const transport = new LiveTransport('https://demo.jellyfin.local', 'token-1', 'user-1', client);

		await transport.getArtists(1, 50, { startsWith: '0' });

		expect(calls).toHaveLength(1);
		expect(queryParam(calls[0].pathOrUrl, 'nameLessThan')).toBe('A');
		expect(queryParam(calls[0].pathOrUrl, 'nameStartsWith')).toBeNull();
	});

	it('omits name filter params when no startsWith is provided on the playlists page query', async () => {
		const playlist: JellyfinPlaylistItem = {
			Id: 'playlist-1',
			Name: 'Playlist A',
			Type: 'Playlist',
		};
		const { calls, client } = createHTTPClient([jsonResponse(200, listResponse([playlist], 1, 0))]);
		const transport = new LiveTransport('https://demo.jellyfin.local', 'token-1', 'user-1', client);

		await transport.getPlaylists(1, 50);

		expect(calls).toHaveLength(1);
		expect(queryParam(calls[0].pathOrUrl, 'includeItemTypes')).toBe('Playlist');
		expect(queryParam(calls[0].pathOrUrl, 'nameStartsWith')).toBeNull();
		expect(queryParam(calls[0].pathOrUrl, 'nameLessThan')).toBeNull();
	});

	it('fetches artists page with paging query and hasMore', async () => {
		const artist: JellyfinArtistItem = {
			Id: 'artist-1',
			Name: 'Artist A',
			Type: 'MusicArtist',
		};
		const { calls, client } = createHTTPClient([jsonResponse(200, listResponse([artist], 10, 3))]);
		const transport = new LiveTransport('https://demo.jellyfin.local', 'token-1', 'user-1', client);

		const page = await transport.getArtists(2, 3);

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
		const { calls, client } = createHTTPClient([jsonResponse(200, listResponse([playlist], 3, 2))]);
		const transport = new LiveTransport('https://demo.jellyfin.local', 'token-1', 'user-1', client);

		const page = await transport.getPlaylists(2, 2);

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
			RecursiveItemCount: 42,
			Type: 'MusicGenre',
		};
		const { calls, client } = createHTTPClient([jsonResponse(200, listResponse([genre], 3, 2))]);
		const transport = new LiveTransport('https://demo.jellyfin.local', 'token-1', 'user-1', client);

		const page = await transport.getGenres(2, 2);

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
				trackCount: 42,
			}),
		);
		expect(page.items[0].imageUrl).toContain('/Items/genre-1/Images/Primary');
	});

	it('fetches genre tracks page with genreIds and paging query', async () => {
		const track: JellyfinTrackItem = {
			ArtistItems: [{ Id: 'artist-1', Name: 'Artist A' }],
			Id: 'track-1',
			Name: 'Track One',
			RunTimeTicks: 120_000_000,
			Type: 'Audio',
		};
		const { calls, client } = createHTTPClient([jsonResponse(200, listResponse([track], 7, 3))]);
		const transport = new LiveTransport('https://demo.jellyfin.local', 'token-1', 'user-1', client);

		const page = await transport.getTracksByGenrePage('genre-1', 2, 3);

		expect(calls).toHaveLength(1);
		expect(queryParam(calls[0].pathOrUrl, 'genreIds')).toBe('genre-1');
		expect(queryParam(calls[0].pathOrUrl, 'includeItemTypes')).toBe('Audio');
		expect(queryParam(calls[0].pathOrUrl, 'startIndex')).toBe('3');
		expect(queryParam(calls[0].pathOrUrl, 'limit')).toBe('3');
		expect(page.totalCount).toBe(7);
		expect(page.hasMore).toBe(true);
		expect(page.items).toHaveLength(1);
		expect(page.items[0].id).toBe('track-1');
	});

	it('fetches playlist tracks page with genre fields', async () => {
		const track: JellyfinTrackItem = {
			GenreItems: [{ Id: 'genre-1', Name: 'Noise Rock' }],
			Id: 'track-1',
			Name: 'Track One',
			RunTimeTicks: 120_000_000,
			Type: 'Audio',
		};
		const { calls, client } = createHTTPClient([jsonResponse(200, listResponse([track], 3, 1))]);
		const transport = new LiveTransport('https://demo.jellyfin.local', 'token-1', 'user-1', client);

		const page = await transport.getTracksByPlaylist('playlist-1', 2, 1);

		expect(calls).toHaveLength(1);
		expect(calls[0].pathOrUrl).toContain('/Playlists/playlist-1/Items');
		expect(queryParam(calls[0].pathOrUrl, 'fields')).toBe('Overview,Genres,MediaSources');
		expect(queryParam(calls[0].pathOrUrl, 'startIndex')).toBe('1');
		expect(queryParam(calls[0].pathOrUrl, 'limit')).toBe('1');
		expect(page.totalCount).toBe(3);
		expect(page.items[0].genres).toEqual([{ id: 'genre-1', name: 'Noise Rock' }]);
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
		const { calls, client } = createHTTPClient([
			jsonResponse(200, listResponse([firstTrack, secondTrack], 2, 0)),
		]);
		const transport = new LiveTransport('https://demo.jellyfin.local', 'token-1', 'user-1', client);

		const tracks = await transport.getArtistTopTracks('artist-1');

		expect(calls).toHaveLength(1);
		expect(queryParam(calls[0].pathOrUrl, 'artistIds')).toBe('artist-1');
		expect(queryParam(calls[0].pathOrUrl, 'includeItemTypes')).toBe('Audio');
		expect(queryParam(calls[0].pathOrUrl, 'limit')).toBe('5');
		expect(queryParam(calls[0].pathOrUrl, 'sortBy')).toBe('PlayCount,SortName');
		expect(queryParam(calls[0].pathOrUrl, 'sortOrder')).toBe('Descending,Ascending');
		expect(tracks.map((track) => track.id)).toEqual(['track-1', 'track-2']);
	});

	it('fetches shuffled library tracks via random sort query', async () => {
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
		const { calls, client } = createHTTPClient([
			jsonResponse(200, listResponse([firstTrack, secondTrack], 2, 0)),
		]);
		const transport = new LiveTransport('https://demo.jellyfin.local', 'token-1', 'user-1', client);

		const page = await transport.getShuffledLibraryTracks(1, 500);

		expect(calls).toHaveLength(1);
		expect(queryParam(calls[0].pathOrUrl, 'includeItemTypes')).toBe('Audio');
		expect(queryParam(calls[0].pathOrUrl, 'sortBy')).toBe('Random');
		expect(queryParam(calls[0].pathOrUrl, 'limit')).toBe('500');
		expect(page.items.map((track) => track.id)).toEqual(['track-1', 'track-2']);
	});

	it('picks several random populated years from the years endpoint in one request', async () => {
		const { calls, client } = createHTTPClient([
			jsonResponse(
				200,
				listResponse(
					[
						{ Name: '2003', ProductionYear: 2003 },
						{ Name: '1994', ProductionYear: 1994 },
						{ Name: '2011', ProductionYear: 2011 },
					],
					3,
					0,
				),
			),
		]);
		const transport = new LiveTransport('https://demo.jellyfin.local', 'token-1', 'user-1', client);

		const years = await transport.getRandomMusicYears(3);

		expect(calls).toHaveLength(1);
		expect(calls[0].pathOrUrl).toContain('/Years?');
		expect(queryParam(calls[0].pathOrUrl, 'includeItemTypes')).toBe('Audio');
		expect(queryParam(calls[0].pathOrUrl, 'sortBy')).toBe('Random');
		expect(queryParam(calls[0].pathOrUrl, 'limit')).toBe('3');
		expect(years).toEqual([2003, 1994, 2011]);
	});

	it('falls back to the year name when productionYear is absent', async () => {
		const { client } = createHTTPClient([
			jsonResponse(200, listResponse([{ Name: '1994' }], 1, 0)),
		]);
		const transport = new LiveTransport('https://demo.jellyfin.local', 'token-1', 'user-1', client);

		expect(await transport.getRandomMusicYears(3)).toEqual([1994]);
	});

	it('returns an empty array when no years are available', async () => {
		const { client } = createHTTPClient([jsonResponse(200, listResponse([], 0, 0))]);
		const transport = new LiveTransport('https://demo.jellyfin.local', 'token-1', 'user-1', client);

		expect(await transport.getRandomMusicYears(3)).toEqual([]);
	});

	it('pages tracks for a year via a small random-sorted query', async () => {
		const firstTrack: JellyfinTrackItem = {
			Id: 'track-1',
			Name: 'Track One',
			ProductionYear: 2003,
			RunTimeTicks: 120_000_000,
			Type: 'Audio',
		};
		const secondTrack: JellyfinTrackItem = {
			Id: 'track-2',
			Name: 'Track Two',
			ProductionYear: 2003,
			RunTimeTicks: 180_000_000,
			Type: 'Audio',
		};
		const { calls, client } = createHTTPClient([
			jsonResponse(200, listResponse([firstTrack, secondTrack], 130, 50)),
		]);
		const transport = new LiveTransport('https://demo.jellyfin.local', 'token-1', 'user-1', client);

		const result = await transport.getTracksByYear(2003, 2, 50);

		expect(calls).toHaveLength(1);
		expect(queryParam(calls[0].pathOrUrl, 'years')).toBe('2003');
		expect(queryParam(calls[0].pathOrUrl, 'includeItemTypes')).toBe('Audio');
		expect(queryParam(calls[0].pathOrUrl, 'sortBy')).toBe('Random');
		expect(queryParam(calls[0].pathOrUrl, 'limit')).toBe('50');
		expect(queryParam(calls[0].pathOrUrl, 'startIndex')).toBe('50');
		expect(result.hasMore).toBe(true);
		expect(result.items.map((track) => track.id)).toEqual(['track-1', 'track-2']);
	});

	it('reports no more pages once the year is exhausted', async () => {
		const track: JellyfinTrackItem = {
			Id: 'track-9',
			Name: 'Last Track',
			ProductionYear: 2003,
			RunTimeTicks: 120_000_000,
			Type: 'Audio',
		};
		const { client } = createHTTPClient([jsonResponse(200, listResponse([track], 51, 50))]);
		const transport = new LiveTransport('https://demo.jellyfin.local', 'token-1', 'user-1', client);

		const result = await transport.getTracksByYear(2003, 2, 50);

		expect(result.hasMore).toBe(false);
		expect(result.items.map((track) => track.id)).toEqual(['track-9']);
	});

	it('returns null artist logo url when no logo metadata exists', async () => {
		const artist: JellyfinArtistItem = {
			Id: 'artist-1',
			Name: 'Artist A',
			Type: 'MusicArtist',
		};
		const { calls, client } = createHTTPClient([jsonResponse(200, artist)]);
		const transport = new LiveTransport('https://demo.jellyfin.local', 'token-1', 'user-1', client);

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
		const { client } = createHTTPClient([jsonResponse(200, artist)]);
		const transport = new LiveTransport('https://demo.jellyfin.local', 'token-1', 'user-1', client);

		const logoUrl = await transport.getArtistLogoUrl('artist-1');

		expect(logoUrl).toContain('/Items/artist-1/Images/Logo');
		expect(logoUrl).toContain('tag=logo-tag-1');
	});

	it('fetches a genre by id with its primary image url', async () => {
		const genre: JellyfinGenreItem = {
			Id: 'genre-1',
			ImageTags: { Primary: 'genre-tag-1' },
			Name: 'Rock',
			Type: 'MusicGenre',
		};
		const { calls, client } = createHTTPClient([jsonResponse(200, genre)]);
		const transport = new LiveTransport('https://demo.jellyfin.local', 'token-1', 'user-1', client);

		const result = await transport.getGenre('genre-1');

		expect(calls[0].pathOrUrl).toContain('/Items/genre-1?');
		expect(result?.id).toBe('genre-1');
		expect(result?.name).toBe('Rock');
		expect(result?.imageUrl).toContain('/Items/genre-1/Images/Primary');
		expect(result?.imageUrl).toContain('tag=genre-tag-1');
	});

	it('returns null when the fetched item is not a genre', async () => {
		const artist: JellyfinArtistItem = { Id: 'genre-1', Name: 'Not a genre', Type: 'MusicArtist' };
		const { client } = createHTTPClient([jsonResponse(200, artist)]);
		const transport = new LiveTransport('https://demo.jellyfin.local', 'token-1', 'user-1', client);

		expect(await transport.getGenre('genre-1')).toBeNull();
	});

	it('fetches a playlist by id with its primary image url', async () => {
		const playlist: JellyfinPlaylistItem = {
			Id: 'playlist-1',
			ImageTags: { Primary: 'pl-tag-1' },
			Name: 'Roadtrip',
			Type: 'Playlist',
		};
		const { calls, client } = createHTTPClient([jsonResponse(200, playlist)]);
		const transport = new LiveTransport('https://demo.jellyfin.local', 'token-1', 'user-1', client);

		const result = await transport.getPlaylist('playlist-1');

		expect(calls[0].pathOrUrl).toContain('/Items/playlist-1?');
		expect(result?.id).toBe('playlist-1');
		expect(result?.name).toBe('Roadtrip');
		expect(result?.imageUrl).toContain('/Items/playlist-1/Images/Primary');
		expect(result?.imageUrl).toContain('tag=pl-tag-1');
	});

	it('returns null when the fetched item is not a playlist', async () => {
		const genre: JellyfinGenreItem = {
			Id: 'playlist-1',
			Name: 'Not a playlist',
			Type: 'MusicGenre',
		};
		const { client } = createHTTPClient([jsonResponse(200, genre)]);
		const transport = new LiveTransport('https://demo.jellyfin.local', 'token-1', 'user-1', client);

		expect(await transport.getPlaylist('playlist-1')).toBeNull();
	});

	it('builds a downloadable track cache url', () => {
		const { client } = createHTTPClient([]);
		const transport = new LiveTransport('https://demo.jellyfin.local', 'token-1', 'user-1', client);

		const cacheUrl = transport.getTrackCacheUrl('track-123');

		expect(cacheUrl).toContain('/Audio/track-123/stream.mp3?');
		expect(cacheUrl).not.toContain('api_key=');
		expect(cacheUrl).toContain('deviceId=atolla');
	});

	it('builds track cache url with configured device id', () => {
		const { client } = createHTTPClient([]);
		const transport = new LiveTransport(
			'https://demo.jellyfin.local',
			'token-1',
			'user-1',
			client,
			{
				clientDeviceId: 'profile-2-device',
			},
		);

		const cacheUrl = transport.getTrackCacheUrl('track-123');

		expect(cacheUrl).toContain('deviceId=profile-2-device');
	});

	it('creates a playlist and returns it with the server id and imageUrl', async () => {
		const { calls, client } = createHTTPClient([
			jsonResponse(200, { Id: 'server-playlist-id' }),
			jsonResponse(200, {
				Id: 'server-playlist-id',
				ImageTags: { Primary: 'tag-abc' },
				Name: 'My Playlist',
				Type: 'Playlist',
			}),
		]);
		const transport = new LiveTransport('https://demo.jellyfin.local', 'token-1', 'user-1', client);

		const playlist = await transport.createPlaylist('My Playlist');

		expect(playlist.id).toBe('server-playlist-id');
		expect(playlist.name).toBe('My Playlist');
		expect(playlist.imageUrl).toContain('/Items/server-playlist-id/Images/Primary');
		expect(playlist.imageUrl).toContain('tag=tag-abc');
		expect(calls).toHaveLength(2);
		expect(calls[0].method).toBe('post');
		expect(calls[0].pathOrUrl).toBe('/Playlists');
		const body = JSON.parse(new TextDecoder().decode(calls[0].body)) as Record<string, unknown>;
		expect(body.Name).toBe('My Playlist');
		expect(body.MediaType).toBe('Audio');
		expect(body.Ids).toBeUndefined();
		expect(calls[1].method).toBe('get');
		expect(calls[1].pathOrUrl).toContain('/Items/server-playlist-id');
	});

	it('includes track id in playlist create body when provided', async () => {
		const { calls, client } = createHTTPClient([
			jsonResponse(200, { Id: 'server-playlist-id' }),
			jsonResponse(200, {
				Id: 'server-playlist-id',
				ImageTags: { Primary: 'tag-abc' },
				Name: 'My Playlist',
				Type: 'Playlist',
			}),
		]);
		const transport = new LiveTransport('https://demo.jellyfin.local', 'token-1', 'user-1', client);

		await transport.createPlaylist('My Playlist', 'track-abc');

		const body = JSON.parse(new TextDecoder().decode(calls[0].body)) as Record<string, unknown>;
		expect(body.Ids).toEqual(['track-abc']);
	});

	it('posts scrobble events with datePlayed', async () => {
		const { calls, client } = createHTTPClient([{ body: undefined, headers: {}, statusCode: 204 }]);
		const transport = new LiveTransport('https://demo.jellyfin.local', 'token-1', 'user-1', client);

		await transport.scrobbleTrackPlayed('track-1', '2026-01-01T00:00:00.000Z');

		expect(calls).toHaveLength(1);
		expect(calls[0].method).toBe('post');
		expect(calls[0].pathOrUrl).toContain('/UserPlayedItems/track-1');
		expect(queryParam(calls[0].pathOrUrl, 'datePlayed')).toBe('2026-01-01T00:00:00.000Z');
		expect(queryParam(calls[0].pathOrUrl, 'userId')).toBe('user-1');
	});

	it('throws SESSION_EXPIRED when the server responds with 401', async () => {
		const { client } = createHTTPClient([jsonResponse(401, {})]);
		const transport = new LiveTransport(
			'https://demo.jellyfin.local/',
			'token-1',
			'user-1',
			client,
		);

		await expect(transport.getAlbums(1, 50)).rejects.toMatchObject({
			err: 'auth_session_expired',
		});
	});
});
