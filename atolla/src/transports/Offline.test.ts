import { describe, expect, it } from 'bun:test';
import type {
	DownloadedAlbumEntry,
	DownloadedArtistEntry,
	DownloadedGenreEntry,
	DownloadedPlaylistEntry,
	DownloadedTrackEntry,
} from '../services/DownloadService';
import { PlaylistCreateService } from '../services/PlaylistCreateService';
import { TransportErrors } from './Errors';
import { OfflineTransport } from './Offline';

function createDownloadsMock(params: {
	albums?: Array<DownloadedAlbumEntry>;
	artists?: Array<DownloadedArtistEntry>;
	genres?: Array<DownloadedGenreEntry>;
	playlists?: Array<DownloadedPlaylistEntry>;
	tracks?: Array<DownloadedTrackEntry>;
}) {
	const albums = params.albums ?? [];
	const genres = params.genres ?? [];
	const playlists = params.playlists ?? [];
	const tracks = params.tracks ?? [];
	const artistById: Record<string, DownloadedArtistEntry> = {};
	for (const entry of params.artists ?? []) {
		artistById[entry.artist.id] = entry;
	}
	const albumById = new Map(albums.map((entry) => [entry.album.id, entry]));
	const genreById = new Map(genres.map((entry) => [entry.genre.id, entry]));
	const playlistById = new Map(playlists.map((entry) => [entry.playlist.id, entry]));
	const trackById = new Map(tracks.map((entry) => [entry.track.id, entry]));

	return {
		getAlbum: (albumId: string) => albumById.get(albumId),
		getAllAlbums: () => albums,
		getAllArtists: () => Object.values(artistById),
		getAllGenres: () => genres,
		getAllPlaylists: () => playlists,
		getAllTracks: () => tracks,
		getArtist: (artistId: string) => artistById[artistId],
		getGenre: (genreId: string) => genreById.get(genreId),
		getPlaylist: (playlistId: string) => playlistById.get(playlistId),
		getTrack: (trackId: string) => trackById.get(trackId),
		getTrackPlaybackUrl: () => '',
		isTrackDownloaded: () => false,
	};
}

function downloadedTrack(
	id: string,
	options: { complete: boolean; productionYear?: number; releaseDate?: string },
): DownloadedTrackEntry {
	return {
		albumIds: [],
		attempts: 0,
		complete: options.complete,
		failed: false,
		genreIds: [],
		playlistIds: [],
		requiredImageKeys: [],
		streamUrl: `file:///${id}.mp3`,
		track: {
			duration: 180,
			id,
			name: id,
			productionYear: options.productionYear,
			releaseDate: options.releaseDate,
		},
	};
}

describe('OfflineTransport', () => {
	it('resolves artist fallback from downloaded album metadata', async () => {
		const transport = new OfflineTransport(
			createDownloadsMock({
				albums: [
					{
						album: {
							artistId: 'artist-1',
							artistName: 'Artist One',
							id: 'album-1',
							name: 'Album One',
						},
						artistLogoUrl: 'https://img/logo-artist-1.png',
						trackIds: [],
					},
				],
			}) as never,
		);

		const artist = await transport.getArtist('artist-1');

		expect(artist).toEqual({
			id: 'artist-1',
			logoUrl: 'https://img/logo-artist-1.png',
			name: 'Artist One',
		});
	});

	it('resolves artist logo fallback from downloaded album metadata', async () => {
		const transport = new OfflineTransport(
			createDownloadsMock({
				albums: [
					{
						album: {
							artistId: 'artist-1',
							artistName: 'Artist One',
							id: 'album-1',
							name: 'Album One',
						},
						artistLogoUrl: 'https://img/logo-artist-1.png',
						trackIds: [],
					},
				],
			}) as never,
		);

		const logoUrl = await transport.getArtistLogoUrl('artist-1');

		expect(logoUrl).toBe('https://img/logo-artist-1.png');
	});

	it('returns a downloaded genre by id', async () => {
		const transport = new OfflineTransport(
			createDownloadsMock({
				genres: [
					{
						genre: { id: 'genre-1', imageUrl: 'https://img/genre-1.png', name: 'Rock' },
						trackArtistLogoUrls: {},
						trackIds: [],
					},
				],
			}) as never,
		);

		const genre = await transport.getGenre('genre-1');

		expect(genre).toEqual({ id: 'genre-1', imageUrl: 'https://img/genre-1.png', name: 'Rock' });
	});

	it('returns null for a genre that is not downloaded', async () => {
		const transport = new OfflineTransport(createDownloadsMock({}) as never);

		expect(await transport.getGenre('genre-1')).toBeNull();
	});

	it('returns a downloaded playlist by id', async () => {
		const transport = new OfflineTransport(
			createDownloadsMock({
				playlists: [
					{
						playlist: {
							id: 'playlist-1',
							imageUrl: 'https://img/playlist-1.png',
							name: 'Roadtrip',
						},
						trackArtistLogoUrls: {},
						trackIds: [],
					},
				],
			}) as never,
		);

		const playlist = await transport.getPlaylist('playlist-1');

		expect(playlist).toEqual({
			id: 'playlist-1',
			imageUrl: 'https://img/playlist-1.png',
			name: 'Roadtrip',
		});
	});

	it('returns null for a playlist that is not downloaded', async () => {
		const transport = new OfflineTransport(createDownloadsMock({}) as never);

		expect(await transport.getPlaylist('playlist-1')).toBeNull();
	});

	it('defaults missing name/artist on a downloaded album so the grid never renders null text', async () => {
		const transport = new OfflineTransport(
			createDownloadsMock({
				albums: [
					{
						album: { artistId: 'artist-1', id: 'album-x' },
						artistLogoUrl: '',
						trackIds: [],
						// simulates a legacy/incomplete persisted album missing name + artistName
					} as unknown as DownloadedAlbumEntry,
				],
			}) as never,
		);

		const albums = (await transport.getAlbums(1, 1000)).items;

		expect(albums).toHaveLength(1);
		expect(albums[0].name).toBe('Unknown Album');
		expect(albums[0].artistName).toBe('');
	});

	it('resolves artist logo fallback from downloaded playlist track metadata', async () => {
		const transport = new OfflineTransport(
			createDownloadsMock({
				playlists: [
					{
						playlist: { id: 'playlist-1', name: 'Playlist One' },
						trackArtistLogoUrls: {
							'track-1': 'https://img/logo-artist-1.png',
						},
						trackIds: ['track-1'],
					},
				],
				tracks: [
					{
						albumIds: [],
						attempts: 0,
						complete: true,
						failed: false,
						genreIds: [],
						playlistIds: ['playlist-1'],
						requiredImageKeys: [],
						streamUrl: 'file:///track-1.mp3',
						track: {
							artistId: 'artist-1',
							duration: 180,
							id: 'track-1',
							name: 'Track One',
						},
					},
				],
			}) as never,
		);

		const logoUrl = await transport.getArtistLogoUrl('artist-1');

		expect(logoUrl).toBe('https://img/logo-artist-1.png');
	});

	it('returns downloaded genres and genre tracks while offline', async () => {
		const transport = new OfflineTransport(
			createDownloadsMock({
				genres: [
					{
						genre: { id: 'genre-1', name: 'Noise Rock', trackCount: 1 },
						trackArtistLogoUrls: { 'track-1': 'https://img/logo-artist-1.png' },
						trackIds: ['track-1'],
					},
				],
				tracks: [
					{
						albumIds: [],
						attempts: 0,
						complete: true,
						failed: false,
						genreIds: ['genre-1'],
						playlistIds: [],
						requiredImageKeys: [],
						streamUrl: 'file:///track-1.mp3',
						track: {
							artistId: 'artist-1',
							duration: 180,
							id: 'track-1',
							name: 'Track One',
						},
					},
				],
			}) as never,
		);

		const genresPage = await transport.getGenres(1, 10);
		const tracksPage = await transport.getTracksByGenre('genre-1', 1, 10);
		const logoUrl = await transport.getArtistLogoUrl('artist-1');

		expect(genresPage.items.map((genre) => genre.id)).toEqual(['genre-1']);
		expect(tracksPage.items.map((track) => track.id)).toEqual(['track-1']);
		expect(tracksPage.totalCount).toBe(1);
		expect(logoUrl).toBe('https://img/logo-artist-1.png');
	});

	it('rejects scrobble delivery while offline', async () => {
		const transport = new OfflineTransport(createDownloadsMock({}) as never);

		await expect(
			transport.scrobbleTrackPlayed('track-1', '2026-01-01T00:00:00.000Z'),
		).rejects.toThrow(TransportErrors.OFFLINE_SCROBBLE_UNAVAILABLE.msg());
	});

	it('derives artists and albums from playlist-only downloaded tracks', async () => {
		const transport = new OfflineTransport(
			createDownloadsMock({
				playlists: [
					{
						playlist: {
							id: 'playlist-1',
							imageUrl: 'https://img/playlist.jpg',
							name: 'Playlist One',
						},
						trackArtistLogoUrls: { 'track-1': 'https://img/logo-artist-1.png' },
						trackIds: ['track-1'],
					},
				],
				tracks: [
					{
						albumIds: [],
						attempts: 0,
						complete: true,
						failed: false,
						genreIds: [],
						playlistIds: ['playlist-1'],
						requiredImageKeys: [],
						streamUrl: 'file:///track-1.mp3',
						track: {
							albumId: 'album-1',
							albumImageUrl: 'https://img/album-1.jpg',
							albumName: 'Album One',
							artistId: 'artist-1',
							artistName: 'Artist One',
							duration: 180,
							id: 'track-1',
							name: 'Track One',
						},
					},
					{
						albumIds: [],
						attempts: 0,
						complete: true,
						failed: false,
						genreIds: [],
						playlistIds: ['playlist-1'],
						requiredImageKeys: [],
						streamUrl: 'file:///track-2.mp3',
						track: {
							albumId: 'album-2',
							albumImageUrl: 'https://img/album-2.jpg',
							albumName: 'Another Album',
							artistId: 'artist-2',
							artistName: 'Another Artist',
							duration: 200,
							id: 'track-2',
							name: 'Track Two',
						},
					},
				],
			}) as never,
		);

		const artists = (await transport.getArtists(1, 1000)).items;
		const albums = (await transport.getAlbums(1, 1000)).items;
		const albumsByArtist = await transport.getAlbumsByArtist('artist-1');
		const tracksByArtist = await transport.getTracksByArtist('artist-1');
		const tracksByAlbum = await transport.getTracksByAlbum('album-1');

		expect(artists).toEqual([
			{ id: 'artist-2', name: 'Another Artist' },
			{ id: 'artist-1', name: 'Artist One' },
		]);
		expect(albums).toEqual([
			{
				artistId: 'artist-1',
				artistName: 'Artist One',
				id: 'album-1',
				imageUrl: 'https://img/album-1.jpg',
				name: 'Album One',
			},
			{
				artistId: 'artist-2',
				artistName: 'Another Artist',
				id: 'album-2',
				imageUrl: 'https://img/album-2.jpg',
				name: 'Another Album',
			},
		]);
		expect(albumsByArtist).toEqual([
			{
				artistId: 'artist-1',
				artistName: 'Artist One',
				id: 'album-1',
				imageUrl: 'https://img/album-1.jpg',
				name: 'Album One',
			},
		]);
		expect(tracksByArtist.map((track) => track.id)).toEqual(['track-1']);
		expect(tracksByAlbum.map((track) => track.id)).toEqual(['track-1']);
	});

	it('sorts artist and album lists case-insensitively', async () => {
		const transport = new OfflineTransport(
			createDownloadsMock({
				tracks: [
					{
						albumIds: [],
						attempts: 0,
						complete: true,
						failed: false,
						genreIds: [],
						playlistIds: ['playlist-1'],
						requiredImageKeys: [],
						streamUrl: 'file:///track-1.mp3',
						track: {
							albumId: 'album-a',
							albumName: 'alpha album',
							artistId: 'artist-a',
							artistName: 'alpha artist',
							duration: 180,
							id: 'track-1',
							name: 'Track One',
						},
					},
					{
						albumIds: [],
						attempts: 0,
						complete: true,
						failed: false,
						genreIds: [],
						playlistIds: ['playlist-1'],
						requiredImageKeys: [],
						streamUrl: 'file:///track-2.mp3',
						track: {
							albumId: 'album-b',
							albumName: 'Bravo Album',
							artistId: 'artist-b',
							artistName: 'Bravo Artist',
							duration: 180,
							id: 'track-2',
							name: 'Track Two',
						},
					},
				],
			}) as never,
		);

		const artists = (await transport.getArtists(1, 1000)).items;
		const albums = (await transport.getAlbums(1, 1000)).items;

		expect(artists.map((artist) => artist.name)).toEqual(['alpha artist', 'Bravo Artist']);
		expect(albums.map((album) => album.name)).toEqual(['alpha album', 'Bravo Album']);
	});

	it('sorts offline artists alphabetically while ignoring leading The', async () => {
		const transport = new OfflineTransport(
			createDownloadsMock({
				tracks: [
					{
						albumIds: [],
						attempts: 0,
						complete: true,
						failed: false,
						genreIds: [],
						playlistIds: ['playlist-1'],
						requiredImageKeys: [],
						streamUrl: 'file:///track-1.mp3',
						track: {
							artistId: 'artist-1',
							artistName: 'The Beatles',
							duration: 180,
							id: 'track-1',
							name: 'Track One',
						},
					},
					{
						albumIds: [],
						attempts: 0,
						complete: true,
						failed: false,
						genreIds: [],
						playlistIds: ['playlist-1'],
						requiredImageKeys: [],
						streamUrl: 'file:///track-2.mp3',
						track: {
							artistId: 'artist-2',
							artistName: 'Arcade Fire',
							duration: 180,
							id: 'track-2',
							name: 'Track Two',
						},
					},
				],
			}) as never,
		);

		const artists = (await transport.getArtists(1, 1000)).items;

		expect(artists.map((artist) => artist.name)).toEqual(['Arcade Fire', 'The Beatles']);
	});

	it('derives artist for an album-only download when artist entry is missing', async () => {
		const transport = new OfflineTransport(
			createDownloadsMock({
				albums: [
					{
						album: {
							artistId: 'artist-1',
							artistName: 'Artist One',
							id: 'album-1',
							name: 'Album One',
						},
						artistLogoUrl: 'https://img/logo-artist-1.png',
						trackIds: [],
					},
				],
			}) as never,
		);

		const artists = (await transport.getArtists(1, 1000)).items;

		expect(artists).toEqual([
			{
				id: 'artist-1',
				logoUrl: 'https://img/logo-artist-1.png',
				name: 'Artist One',
			},
		]);
	});

	it('does not duplicate an artist that is in the dict and also has a downloaded album', async () => {
		const transport = new OfflineTransport(
			createDownloadsMock({
				albums: [
					{
						album: {
							artistId: 'artist-1',
							artistName: 'Artist One',
							id: 'album-1',
							name: 'Album One',
						},
						artistLogoUrl: 'https://img/logo-artist-1.png',
						trackIds: [],
					},
				],
				artists: [
					{
						albumIds: ['album-1'],
						artist: { id: 'artist-1', name: 'Artist One' },
					},
				],
			}) as never,
		);

		const artists = (await transport.getArtists(1, 1000)).items;

		expect(artists).toHaveLength(1);
		expect(artists[0].id).toBe('artist-1');
	});

	it('does not duplicate an artist that is in the dict and also referenced by a downloaded track', async () => {
		const transport = new OfflineTransport(
			createDownloadsMock({
				artists: [
					{
						albumIds: [],
						artist: { id: 'artist-1', name: 'Artist One' },
					},
				],
				tracks: [
					{
						albumIds: [],
						attempts: 0,
						complete: true,
						failed: false,
						genreIds: [],
						playlistIds: ['playlist-1'],
						requiredImageKeys: [],
						streamUrl: 'file:///track-1.mp3',
						track: {
							artistId: 'artist-1',
							artistName: 'Artist One',
							duration: 180,
							id: 'track-1',
							name: 'Track One',
						},
					},
				],
			}) as never,
		);

		const artists = (await transport.getArtists(1, 1000)).items;

		expect(artists).toHaveLength(1);
		expect(artists[0].id).toBe('artist-1');
	});

	it('includes an artist from the dict even without album or track fallbacks', async () => {
		const transport = new OfflineTransport(
			createDownloadsMock({
				artists: [
					{
						albumIds: [],
						artist: { id: 'artist-1', imageUrl: 'https://img/artist-1.jpg', name: 'Artist One' },
					},
				],
			}) as never,
		);

		const artists = (await transport.getArtists(1, 1000)).items;

		expect(artists).toEqual([
			{ id: 'artist-1', imageUrl: 'https://img/artist-1.jpg', name: 'Artist One' },
		]);
	});

	it('sorts tracks from a directly downloaded album by track number', async () => {
		const transport = new OfflineTransport(
			createDownloadsMock({
				albums: [
					{
						album: {
							artistId: 'artist-1',
							artistName: 'Artist One',
							id: 'album-1',
							name: 'Album One',
						},
						artistLogoUrl: null,
						trackIds: ['track-3', 'track-1', 'track-2'],
					},
				],
				tracks: [
					{
						albumIds: ['album-1'],
						attempts: 0,
						complete: true,
						failed: false,
						genreIds: [],
						playlistIds: [],
						requiredImageKeys: [],
						streamUrl: '',
						track: {
							albumId: 'album-1',
							duration: 100,
							id: 'track-1',
							name: 'Track One',
							trackNumber: 1,
						},
					},
					{
						albumIds: ['album-1'],
						attempts: 0,
						complete: true,
						failed: false,
						genreIds: [],
						playlistIds: [],
						requiredImageKeys: [],
						streamUrl: '',
						track: {
							albumId: 'album-1',
							duration: 100,
							id: 'track-2',
							name: 'Track Two',
							trackNumber: 2,
						},
					},
					{
						albumIds: ['album-1'],
						attempts: 0,
						complete: true,
						failed: false,
						genreIds: [],
						playlistIds: [],
						requiredImageKeys: [],
						streamUrl: '',
						track: {
							albumId: 'album-1',
							duration: 100,
							id: 'track-3',
							name: 'Track Three',
							trackNumber: 3,
						},
					},
				],
			}) as never,
		);

		const tracks = await transport.getTracksByAlbum('album-1');

		expect(tracks.map((t) => t.id)).toEqual(['track-1', 'track-2', 'track-3']);
	});

	it('sorts tracks from a playlist-originated album by track number', async () => {
		const transport = new OfflineTransport(
			createDownloadsMock({
				tracks: [
					{
						albumIds: [],
						attempts: 0,
						complete: true,
						failed: false,
						genreIds: [],
						playlistIds: ['playlist-1'],
						requiredImageKeys: [],
						streamUrl: '',
						track: {
							albumId: 'album-1',
							duration: 100,
							id: 'track-3',
							name: 'Track Three',
							trackNumber: 3,
						},
					},
					{
						albumIds: [],
						attempts: 0,
						complete: true,
						failed: false,
						genreIds: [],
						playlistIds: ['playlist-1'],
						requiredImageKeys: [],
						streamUrl: '',
						track: {
							albumId: 'album-1',
							duration: 100,
							id: 'track-1',
							name: 'Track One',
							trackNumber: 1,
						},
					},
					{
						albumIds: [],
						attempts: 0,
						complete: true,
						failed: false,
						genreIds: [],
						playlistIds: ['playlist-1'],
						requiredImageKeys: [],
						streamUrl: '',
						track: {
							albumId: 'album-1',
							duration: 100,
							id: 'track-2',
							name: 'Track Two',
							trackNumber: 2,
						},
					},
				],
			}) as never,
		);

		const tracks = await transport.getTracksByAlbum('album-1');

		expect(tracks.map((t) => t.id)).toEqual(['track-1', 'track-2', 'track-3']);
	});

	it('includes releaseDate on album stubs built from playlist-originated tracks', async () => {
		const transport = new OfflineTransport(
			createDownloadsMock({
				tracks: [
					{
						albumIds: [],
						attempts: 0,
						complete: true,
						failed: false,
						genreIds: [],
						playlistIds: ['playlist-1'],
						requiredImageKeys: [],
						streamUrl: '',
						track: {
							albumId: 'album-1',
							albumName: 'Album One',
							artistId: 'artist-1',
							artistName: 'Artist One',
							duration: 100,
							id: 'track-1',
							name: 'Track One',
							releaseDate: '2023-06-15',
						},
					},
				],
			}) as never,
		);

		const albums = (await transport.getAlbums(1, 1000)).items;

		expect(albums[0].releaseDate).toBe('2023-06-15');
	});

	it('orders all albums by releaseDate descending with missing dates last', async () => {
		const transport = new OfflineTransport(
			createDownloadsMock({
				albums: [
					{
						album: {
							artistId: 'artist-1',
							artistName: 'Artist One',
							id: 'album-old',
							name: 'Old Album',
							releaseDate: '2020-01-01',
						},
						artistLogoUrl: null,
						trackIds: [],
					},
					{
						album: {
							artistId: 'artist-1',
							artistName: 'Artist One',
							id: 'album-new',
							name: 'New Album',
							releaseDate: '2025-01-01',
						},
						artistLogoUrl: null,
						trackIds: [],
					},
					{
						album: {
							artistId: 'artist-2',
							artistName: 'Artist Two',
							id: 'album-no-date',
							name: 'No Date Album',
						},
						artistLogoUrl: null,
						trackIds: [],
					},
				],
			}) as never,
		);

		const albums = (await transport.getAlbums(1, 1000)).items;

		expect(albums.map((album) => album.id)).toEqual(['album-new', 'album-old', 'album-no-date']);
	});

	it('returns artist albums without forcing alphabetical ordering', async () => {
		const transport = new OfflineTransport(
			createDownloadsMock({
				albums: [
					{
						album: {
							artistId: 'artist-1',
							artistName: 'Artist One',
							id: 'album-new',
							name: 'Newest Album',
							releaseDate: '2025-01-01',
						},
						artistLogoUrl: null,
						trackIds: [],
					},
					{
						album: {
							artistId: 'artist-1',
							artistName: 'Artist One',
							id: 'album-old',
							name: 'Old Album',
							releaseDate: '2020-01-01',
						},
						artistLogoUrl: null,
						trackIds: [],
					},
				],
				artists: [
					{ albumIds: ['album-new', 'album-old'], artist: { id: 'artist-1', name: 'Artist One' } },
				],
			}) as never,
		);

		const albums = await transport.getAlbumsByArtist('artist-1');

		expect(albums.map((album) => album.id)).toEqual(['album-new', 'album-old']);
	});

	it('picks distinct years present in the completed downloads', async () => {
		const transport = new OfflineTransport(
			createDownloadsMock({
				tracks: [
					downloadedTrack('track-1', { complete: true, productionYear: 2008 }),
					downloadedTrack('track-2', { complete: true, productionYear: 2008 }),
					downloadedTrack('track-3', { complete: true, productionYear: 1998 }),
				],
			}) as never,
		);

		const years = await transport.getRandomMusicYears(3);

		expect([...years].sort()).toEqual([1998, 2008]);
	});

	it('ignores incomplete and undated downloads when picking years', async () => {
		const transport = new OfflineTransport(
			createDownloadsMock({
				tracks: [
					downloadedTrack('track-1', { complete: false, productionYear: 1999 }),
					downloadedTrack('track-2', { complete: true }),
				],
			}) as never,
		);

		expect(await transport.getRandomMusicYears(3)).toEqual([]);
	});

	it('pages only completed tracks from the requested year, id-sorted for stable paging', async () => {
		const transport = new OfflineTransport(
			createDownloadsMock({
				tracks: [
					downloadedTrack('track-b', { complete: true, productionYear: 2010 }),
					downloadedTrack('track-a', { complete: true, productionYear: 2010 }),
					downloadedTrack('track-c', { complete: true, productionYear: 1990 }),
					downloadedTrack('track-d', { complete: false, productionYear: 2010 }),
				],
			}) as never,
		);

		const firstPage = await transport.getTracksByYear(2010, 1, 1);
		const secondPage = await transport.getTracksByYear(2010, 2, 1);

		expect(firstPage.items.map((track) => track.id)).toEqual(['track-a']);
		expect(firstPage.hasMore).toBe(true);
		expect(secondPage.items.map((track) => track.id)).toEqual(['track-b']);
		expect(secondPage.hasMore).toBe(false);
	});

	describe('getShuffledLibraryTracks', () => {
		function withStubbedRandom<T>(value: number, run: () => T): T {
			const original = Math.random;
			Math.random = () => value;
			try {
				return run();
			} finally {
				Math.random = original;
			}
		}

		it('shuffles the completed tracks rather than returning them id-sorted', async () => {
			const transport = new OfflineTransport(
				createDownloadsMock({
					tracks: [
						downloadedTrack('track-a', { complete: true }),
						downloadedTrack('track-b', { complete: true }),
						downloadedTrack('track-c', { complete: true }),
						downloadedTrack('track-d', { complete: true }),
					],
				}) as never,
			);

			const { items } = await withStubbedRandom(0, () =>
				transport.getShuffledLibraryTracks(1, 500),
			);
			const ids = items.map((track) => track.id);

			expect([...ids].sort()).toEqual(['track-a', 'track-b', 'track-c', 'track-d']);
			expect(ids).not.toEqual(['track-a', 'track-b', 'track-c', 'track-d']);
		});

		it('excludes tracks that are not fully downloaded', async () => {
			const transport = new OfflineTransport(
				createDownloadsMock({
					tracks: [
						downloadedTrack('track-a', { complete: true }),
						downloadedTrack('track-b', { complete: false }),
						downloadedTrack('track-c', { complete: true }),
					],
				}) as never,
			);

			const { items } = await transport.getShuffledLibraryTracks(1, 500);

			expect(items.map((track) => track.id).sort()).toEqual(['track-a', 'track-c']);
		});

		it('pages the shuffled result and reports whether more remain', async () => {
			const transport = new OfflineTransport(
				createDownloadsMock({
					tracks: [
						downloadedTrack('track-a', { complete: true }),
						downloadedTrack('track-b', { complete: true }),
						downloadedTrack('track-c', { complete: true }),
					],
				}) as never,
			);

			const firstPage = await transport.getShuffledLibraryTracks(1, 2);
			const secondPage = await transport.getShuffledLibraryTracks(2, 2);

			expect(firstPage.items).toHaveLength(2);
			expect(firstPage.hasMore).toBe(true);
			expect(secondPage.items).toHaveLength(1);
			expect(secondPage.hasMore).toBe(false);
		});
	});

	describe('createPlaylist (offline)', () => {
		function createNullStore(): {
			fetchString: () => Promise<string>;
			storeString: () => Promise<void>;
		} {
			return {
				fetchString: () => Promise.reject(new Error('not found')),
				storeString: () => Promise.resolve(),
			};
		}

		it('returns a local playlist immediately and stores it as pending', async () => {
			const playlistCreateService = new PlaylistCreateService(createNullStore());
			const transport = new OfflineTransport(
				createDownloadsMock({}) as never,
				playlistCreateService,
			);

			const playlist = await transport.createPlaylist('My Offline Playlist', 'track-1');

			expect(playlist.name).toBe('My Offline Playlist');
			expect(playlist.id).toContain('local-playlist-');
			expect(playlistCreateService.getPending()).toHaveLength(1);
			expect(playlistCreateService.getPending()[0].trackId).toBe('track-1');
		});

		it('rejects when no PlaylistCreateService is provided', async () => {
			const transport = new OfflineTransport(createDownloadsMock({}) as never);

			await expect(transport.createPlaylist('My Playlist')).rejects.toThrow(
				TransportErrors.OFFLINE_PLAYLIST_CREATE_UNAVAILABLE.msg(),
			);
		});

		it('getAllPlaylists includes pending creates alongside downloaded playlists', async () => {
			const playlistCreateService = new PlaylistCreateService(createNullStore());
			playlistCreateService.enqueue('Pending Playlist', 'track-1');

			const transport = new OfflineTransport(
				createDownloadsMock({
					playlists: [
						{
							playlist: { id: 'downloaded-1', name: 'Downloaded Playlist' },
							trackArtistLogoUrls: {},
							trackIds: [],
						},
					],
				}) as never,
				playlistCreateService,
			);

			const playlists = (await transport.getPlaylists(1, 1000)).items;

			expect(playlists).toHaveLength(2);
			expect(playlists.some((p) => p.name === 'Downloaded Playlist')).toBe(true);
			expect(playlists.some((p) => p.name === 'Pending Playlist')).toBe(true);
		});

		it('getTracksByPlaylist returns the initial track for a local playlist', async () => {
			const playlistCreateService = new PlaylistCreateService(createNullStore());
			const pending = playlistCreateService.enqueue('My Playlist', 'track-42');

			const transport = new OfflineTransport(
				createDownloadsMock({
					tracks: [
						{
							albumIds: [],
							attempts: 0,
							complete: true,
							failed: false,
							genreIds: [],
							playlistIds: [],
							requiredImageKeys: [],
							streamUrl: '',
							track: {
								albumId: undefined,
								albumImageUrl: undefined,
								albumName: undefined,
								artistId: 'artist-1',
								artistName: 'Artist One',
								duration: 180,
								id: 'track-42',
								name: 'Track 42',
								releaseDate: undefined,
								trackNumber: 1,
							},
						},
					],
				}) as never,
				playlistCreateService,
			);

			const tracks = (await transport.getTracksByPlaylist(pending.id, 1, 500)).items;

			expect(tracks).toHaveLength(1);
			expect(tracks[0].id).toBe('track-42');
		});

		it('getTracksByPlaylist returns empty array for a local playlist with no track', async () => {
			const playlistCreateService = new PlaylistCreateService(createNullStore());
			const pending = playlistCreateService.enqueue('Empty Playlist', '');

			const transport = new OfflineTransport(
				createDownloadsMock({}) as never,
				playlistCreateService,
			);

			const tracks = (await transport.getTracksByPlaylist(pending.id, 1, 500)).items;

			expect(tracks).toHaveLength(0);
		});
	});
});
