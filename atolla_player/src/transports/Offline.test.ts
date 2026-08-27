import { describe, expect, it } from 'bun:test';
import type { Album } from 'atolla_core/src/models/Album';
import type { Genre } from 'atolla_core/src/models/Genre';
import { TransportErrors } from 'atolla_core/src/transports/Errors';
import type {
	DownloadedAlbumEntry,
	DownloadedArtistEntry,
	DownloadedGenreEntry,
	DownloadedPlaylistEntry,
	DownloadedTrackEntry,
} from '../services/DownloadService';
import { PlaylistCreateService } from '../services/PlaylistCreateService';
import { OfflineTransport } from './Offline';

function createDownloadsMock(params: {
	albumMetadata?: Array<Album>;
	albums?: Array<DownloadedAlbumEntry>;
	artists?: Array<DownloadedArtistEntry>;
	genres?: Array<DownloadedGenreEntry>;
	playlists?: Array<DownloadedPlaylistEntry>;
	tracks?: Array<DownloadedTrackEntry>;
}) {
	const albums = params.albums ?? [];
	const albumMetadata = new Map((params.albumMetadata ?? []).map((album) => [album.id, album]));
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
		getAlbumMetadata: (albumId: string) => albumMetadata.get(albumId),
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
	options: {
		albumId?: string;
		artistId?: string;
		complete: boolean;
		genreIds?: Array<string>;
		genres?: Array<Genre>;
		name?: string;
		productionYear?: number;
		releaseDate?: string;
		sortName?: string;
	},
): DownloadedTrackEntry {
	return {
		albumIds: options.albumId ? [options.albumId] : [],
		attempts: 0,
		complete: options.complete,
		failed: false,
		genreIds: options.genreIds ?? [],
		playlistIds: [],
		requiredImageKeys: [],
		streamUrl: `file:///${id}.mp3`,
		track: {
			albumId: options.albumId,
			artistId: options.artistId,
			duration: 180,
			genres: options.genres,
			id,
			name: options.name ?? id,
			productionYear: options.productionYear,
			releaseDate: options.releaseDate,
			sortName: options.sortName,
		},
	};
}

function downloadedGenre(id: string, trackIds: Array<string>): DownloadedGenreEntry {
	return {
		genre: { id, name: id },
		trackArtistLogoUrls: {},
		trackIds,
	};
}

describe('OfflineTransport', () => {
	const playlistCreateService = new PlaylistCreateService(createNullStore());

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
			playlistCreateService,
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
			playlistCreateService,
		);

		const logoUrl = await transport.getArtistLogoUrl('artist-1');

		expect(logoUrl).toBe('https://img/logo-artist-1.png');
	});

	it('resolves an artist logo from the image cache when nothing is downloaded', async () => {
		const resolved: Array<[string, string]> = [];
		const transport = new OfflineTransport(
			createDownloadsMock({}) as never,
			playlistCreateService,
			undefined,
			(category, identity) => {
				resolved.push([category, identity]);
				return category === 'artist_logo' ? 'file:///cache/artist_logo_abc' : null;
			},
		);

		const logoUrl = await transport.getArtistLogoUrl('artist-1');

		expect(logoUrl).toBe('file:///cache/artist_logo_abc');
		expect(resolved).toContainEqual(['artist_logo', 'artist-1']);
	});

	it('peeks the artist logo without waiting, so a first render can show it', () => {
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
			playlistCreateService,
			undefined,
			() => null,
		);

		expect(transport.peekArtistLogoUrl('artist-1')).toBe('https://img/logo-artist-1.png');
		expect(transport.peekArtistLogoUrl('artist-2')).toBeNull();
	});

	it('prefers a downloaded artist logo over the image cache', async () => {
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
			playlistCreateService,
			undefined,
			() => 'file:///cache/artist_logo_abc',
		);

		expect(await transport.getArtistLogoUrl('artist-1')).toBe('https://img/logo-artist-1.png');
	});

	it('returns an artist carrying the cached logo when nothing is downloaded', async () => {
		const transport = new OfflineTransport(
			createDownloadsMock({}) as never,
			playlistCreateService,
			undefined,
			(category) => (category === 'artist_logo' ? 'file:///cache/artist_logo_abc' : null),
		);

		const artist = await transport.getArtist('artist-1');

		expect(artist?.logoUrl).toBe('file:///cache/artist_logo_abc');
	});

	it('returns null for an artist with nothing downloaded and nothing cached', async () => {
		const transport = new OfflineTransport(
			createDownloadsMock({}) as never,
			playlistCreateService,
			undefined,
			() => null,
		);

		expect(await transport.getArtist('artist-1')).toBeNull();
	});

	it('carries a cached logo onto an artist derived from a downloaded album', async () => {
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
						trackIds: [],
					},
				],
			}) as never,
			playlistCreateService,
			undefined,
			(category) => (category === 'artist_logo' ? 'file:///cache/artist_logo_abc' : null),
		);

		const artist = await transport.getArtist('artist-1');

		expect(artist?.logoUrl).toBe('file:///cache/artist_logo_abc');
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
			playlistCreateService,
		);

		const genre = await transport.getGenre('genre-1');

		expect(genre).toEqual({ id: 'genre-1', imageUrl: 'https://img/genre-1.png', name: 'Rock' });
	});

	it('returns null for a genre that is not downloaded', async () => {
		const transport = new OfflineTransport(createDownloadsMock({}) as never, playlistCreateService);

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
			playlistCreateService,
		);

		const playlist = await transport.getPlaylist('playlist-1');

		expect(playlist).toEqual({
			id: 'playlist-1',
			imageUrl: 'https://img/playlist-1.png',
			name: 'Roadtrip',
		});
	});

	it('returns null for a playlist that is not downloaded', async () => {
		const transport = new OfflineTransport(createDownloadsMock({}) as never, playlistCreateService);

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
			playlistCreateService,
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
			playlistCreateService,
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
			playlistCreateService,
		);

		const genresPage = await transport.getGenres(1, 10);
		const tracksPage = await transport.getTracksByGenre('genre-1', 1, 10);
		const logoUrl = await transport.getArtistLogoUrl('artist-1');

		expect(genresPage.items.map((genre) => genre.id)).toEqual(['genre-1']);
		expect(tracksPage.items.map((track) => track.id)).toEqual(['track-1']);
		expect(tracksPage.totalCount).toBe(1);
		expect(logoUrl).toBe('https://img/logo-artist-1.png');
	});

	it('sorts genre tracks by name so offline matches the online ordering', async () => {
		const transport = new OfflineTransport(
			createDownloadsMock({
				genres: [downloadedGenre('genre-1', ['track-3', 'track-1', 'track-2'])],
				tracks: [
					downloadedTrack('track-1', { complete: true, name: 'Beta' }),
					downloadedTrack('track-2', { complete: true, name: 'alpha' }),
					downloadedTrack('track-3', { complete: true, name: 'Gamma' }),
				],
			}) as never,
			playlistCreateService,
		);

		const tracksPage = await transport.getTracksByGenre('genre-1', 1, 10);

		expect(tracksPage.items.map((track) => track.name)).toEqual(['alpha', 'Beta', 'Gamma']);
	});

	it("ignores the track's server sort name, which is disc/track-number prefixed", async () => {
		const transport = new OfflineTransport(
			createDownloadsMock({
				genres: [downloadedGenre('genre-1', ['track-1', 'track-2', 'track-3'])],
				tracks: [
					downloadedTrack('track-1', {
						complete: true,
						name: 'Zenith',
						sortName: '0001 - 0001 - zenith',
					}),
					downloadedTrack('track-2', {
						complete: true,
						name: 'Anthem',
						sortName: '0001 - 0002 - anthem',
					}),
					downloadedTrack('track-3', { complete: true, name: 'Meridian' }),
				],
			}) as never,
			playlistCreateService,
		);

		const tracksPage = await transport.getTracksByGenre('genre-1', 1, 10);

		expect(tracksPage.items.map((track) => track.name)).toEqual(['Anthem', 'Meridian', 'Zenith']);
	});

	it('sorts genre tracks by name when there is no downloaded genre index', async () => {
		const transport = new OfflineTransport(
			createDownloadsMock({
				tracks: [
					downloadedTrack('track-1', { complete: true, genreIds: ['genre-1'], name: 'Gamma' }),
					downloadedTrack('track-2', { complete: true, genreIds: ['genre-1'], name: 'Alpha' }),
				],
			}) as never,
			playlistCreateService,
		);

		const tracksPage = await transport.getTracksByGenre('genre-1', 1, 10);

		expect(tracksPage.items.map((track) => track.name)).toEqual(['Alpha', 'Gamma']);
	});

	it('paginates genre tracks over the sorted list', async () => {
		const transport = new OfflineTransport(
			createDownloadsMock({
				genres: [downloadedGenre('genre-1', ['track-1', 'track-2', 'track-3'])],
				tracks: [
					downloadedTrack('track-1', { complete: true, name: 'Gamma' }),
					downloadedTrack('track-2', { complete: true, name: 'Alpha' }),
					downloadedTrack('track-3', { complete: true, name: 'Beta' }),
				],
			}) as never,
			playlistCreateService,
		);

		const firstPage = await transport.getTracksByGenre('genre-1', 1, 2);
		const secondPage = await transport.getTracksByGenre('genre-1', 2, 2);

		expect(firstPage.items.map((track) => track.name)).toEqual(['Alpha', 'Beta']);
		expect(firstPage.hasMore).toBe(true);
		expect(secondPage.items.map((track) => track.name)).toEqual(['Gamma']);
		expect(secondPage.hasMore).toBe(false);
	});

	it('rejects scrobble delivery while offline', async () => {
		const transport = new OfflineTransport(createDownloadsMock({}) as never, playlistCreateService);

		await expect(transport.scrobbleTrackPlayed('track-1', '2026-01-01T00:00:00.000Z')).rejects.toBe(
			TransportErrors.OFFLINE_SCROBBLE,
		);
	});

	it('rejects a lyrics read while offline rather than answering none', async () => {
		const transport = new OfflineTransport(createDownloadsMock({}) as never, playlistCreateService);

		await expect(transport.getLyrics('track-1')).rejects.toBe(TransportErrors.OFFLINE_LYRICS);
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
			playlistCreateService,
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
			playlistCreateService,
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
			playlistCreateService,
		);

		const artists = (await transport.getArtists(1, 1000)).items;

		expect(artists.map((artist) => artist.name)).toEqual(['Arcade Fire', 'The Beatles']);
	});

	it('sorts downloaded artists by their stored server key, alongside artists without one', async () => {
		const transport = new OfflineTransport(
			createDownloadsMock({
				artists: [
					{ albumIds: [], artist: { id: 'artist-1', name: 'NNAMDÏ', sortName: 'nnamdï' } },
					{
						albumIds: [],
						artist: { id: 'artist-2', name: 'A Perfect Circle', sortName: 'perfect circle' },
					},
					{ albumIds: [], artist: { id: 'artist-3', name: 'MØL', sortName: 'møl' } },
					{ albumIds: [], artist: { id: 'artist-4', name: 'Deafheaven' } },
				],
			}) as never,
			playlistCreateService,
		);

		const artists = (await transport.getArtists(1, 1000)).items;

		expect(artists.map((artist) => artist.name)).toEqual([
			'Deafheaven',
			'MØL',
			'NNAMDÏ',
			'A Perfect Circle',
		]);
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
			playlistCreateService,
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
			playlistCreateService,
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
			playlistCreateService,
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
			playlistCreateService,
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
			playlistCreateService,
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
			playlistCreateService,
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
			playlistCreateService,
		);

		const albums = (await transport.getAlbums(1, 1000)).items;

		expect(albums[0].releaseDate).toBe('2023-06-15');
	});

	it('uses the recorded album record for playlist-originated albums', async () => {
		const transport = new OfflineTransport(
			createDownloadsMock({
				albumMetadata: [
					{
						addedDate: '2024-02-02',
						artistId: 'artist-1',
						artistName: 'Artist One',
						bio: 'about the album',
						genres: [{ id: 'genre-1', name: 'Post Rock' }],
						id: 'album-1',
						imageUrl: 'https://img/album-1.jpg',
						name: 'Album One',
						releaseDate: '2021-03-04',
					},
				],
				tracks: [
					downloadedTrack('track-1', {
						albumId: 'album-1',
						complete: true,
						genres: [{ id: 'genre-2', name: 'Ambient' }],
					}),
				],
			}) as never,
			playlistCreateService,
		);

		const albums = (await transport.getAlbums(1, 1000)).items;

		expect(albums).toEqual([
			{
				addedDate: '2024-02-02',
				artistId: 'artist-1',
				artistName: 'Artist One',
				bio: 'about the album',
				genres: [{ id: 'genre-1', name: 'Post Rock' }],
				id: 'album-1',
				imageUrl: 'https://img/album-1.jpg',
				name: 'Album One',
				releaseDate: '2021-03-04',
			},
		]);
	});

	it('keeps the recorded album details when the downloaded album record is a track-derived stub', async () => {
		const transport = new OfflineTransport(
			createDownloadsMock({
				albumMetadata: [
					{
						artistId: 'artist-1',
						artistName: 'Artist One',
						bio: 'about the album',
						genres: [{ id: 'genre-1', name: 'Post Rock' }],
						id: 'album-1',
						imageUrl: 'https://img/album-1.jpg',
						name: 'Album One',
						releaseDate: '2021-03-04',
					},
				],
				albums: [
					{
						album: {
							artistId: 'artist-1',
							artistName: 'Artist One',
							id: 'album-1',
							imageUrl: 'https://img/album-1.jpg',
							name: 'Album One',
						},
						artistLogoUrl: null,
						trackIds: ['track-1'],
					},
				],
				tracks: [downloadedTrack('track-1', { albumId: 'album-1', complete: true })],
			}) as never,
			playlistCreateService,
		);

		const albums = await transport.getAlbumsByIds(['album-1']);

		expect(albums[0].genres).toEqual([{ id: 'genre-1', name: 'Post Rock' }]);
		expect(albums[0].releaseDate).toBe('2021-03-04');
		expect(albums[0].bio).toBe('about the album');
	});

	it('finds playlist-originated albums and artists when searching offline', async () => {
		const transport = new OfflineTransport(
			createDownloadsMock({
				albumMetadata: [
					{
						artistId: 'artist-1',
						artistName: 'Artist One',
						id: 'album-1',
						name: 'Album One',
					},
				],
				tracks: [
					{
						...downloadedTrack('track-1', {
							albumId: 'album-1',
							artistId: 'artist-1',
							complete: true,
						}),
						track: {
							albumId: 'album-1',
							artistId: 'artist-1',
							artistName: 'Artist One',
							duration: 180,
							id: 'track-1',
							name: 'Track One',
						},
					},
				],
			}) as never,
			playlistCreateService,
		);

		const results = await transport.search('one');

		expect(results.albums.map((album) => album.id)).toEqual(['album-1']);
		expect(results.artists.map((artist) => artist.id)).toEqual(['artist-1']);
		expect(results.tracks.map((track) => track.id)).toEqual(['track-1']);
	});

	it('omits playlist-originated albums and artists whose tracks have not downloaded yet', async () => {
		const transport = new OfflineTransport(
			createDownloadsMock({
				albumMetadata: [
					{
						artistId: 'artist-1',
						artistName: 'Artist One',
						id: 'album-1',
						name: 'Album One',
					},
				],
				tracks: [
					{
						...downloadedTrack('track-1', {
							albumId: 'album-1',
							artistId: 'artist-1',
							complete: false,
						}),
						track: {
							albumId: 'album-1',
							artistId: 'artist-1',
							artistName: 'Artist One',
							duration: 180,
							id: 'track-1',
							name: 'Track One',
						},
					},
				],
			}) as never,
			playlistCreateService,
		);

		const results = await transport.search('one');

		expect(results.albums).toEqual([]);
		expect(results.artists).toEqual([]);
		expect(results.tracks).toEqual([]);
		expect((await transport.getAlbums(1, 100)).items).toEqual([]);
	});

	it('derives genres for album stubs built from playlist-originated tracks', async () => {
		const transport = new OfflineTransport(
			createDownloadsMock({
				tracks: [
					downloadedTrack('track-1', {
						albumId: 'album-1',
						complete: true,
						genres: [{ id: 'genre-1', name: 'Post Rock' }],
					}),
					downloadedTrack('track-2', {
						albumId: 'album-1',
						complete: true,
						genres: [
							{ id: 'genre-1', name: 'Post Rock' },
							{ id: 'genre-2', name: 'Ambient' },
						],
					}),
				],
			}) as never,
			playlistCreateService,
		);

		const albums = (await transport.getAlbums(1, 1000)).items;

		expect(albums[0]?.genres).toEqual([
			{ id: 'genre-2', name: 'Ambient' },
			{ id: 'genre-1', name: 'Post Rock' },
		]);
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
			playlistCreateService,
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
			playlistCreateService,
		);

		const albums = await transport.getAlbumsByArtist('artist-1');

		expect(albums.map((album) => album.id)).toEqual(['album-new', 'album-old']);
	});

	it("includes playlist-originated albums alongside the artist's downloaded albums", async () => {
		const transport = new OfflineTransport(
			createDownloadsMock({
				albums: [
					{
						album: {
							artistId: 'artist-1',
							artistName: 'Artist One',
							id: 'album-downloaded',
							name: 'Downloaded Album',
							releaseDate: '2025-01-01',
						},
						artistLogoUrl: null,
						trackIds: ['track-1'],
					},
				],
				artists: [
					{ albumIds: ['album-downloaded'], artist: { id: 'artist-1', name: 'Artist One' } },
				],
				tracks: [
					downloadedTrack('track-1', {
						albumId: 'album-downloaded',
						artistId: 'artist-1',
						complete: true,
					}),
					downloadedTrack('track-2', {
						albumId: 'album-from-playlist',
						artistId: 'artist-1',
						complete: true,
						releaseDate: '2020-01-01',
					}),
				],
			}) as never,
			playlistCreateService,
		);

		const albums = await transport.getAlbumsByArtist('artist-1');

		expect(albums.map((album) => album.id)).toEqual(['album-downloaded', 'album-from-playlist']);
	});

	it("includes playlist-originated tracks alongside the artist's downloaded album tracks", async () => {
		const transport = new OfflineTransport(
			createDownloadsMock({
				albums: [
					{
						album: {
							artistId: 'artist-1',
							artistName: 'Artist One',
							id: 'album-downloaded',
							name: 'Downloaded Album',
						},
						artistLogoUrl: null,
						trackIds: ['track-1'],
					},
				],
				artists: [
					{ albumIds: ['album-downloaded'], artist: { id: 'artist-1', name: 'Artist One' } },
				],
				tracks: [
					downloadedTrack('track-1', {
						albumId: 'album-downloaded',
						artistId: 'artist-1',
						complete: true,
					}),
					downloadedTrack('track-2', {
						albumId: 'album-from-playlist',
						artistId: 'artist-1',
						complete: true,
					}),
				],
			}) as never,
			playlistCreateService,
		);

		const tracks = await transport.getTracksByArtist('artist-1');

		expect(tracks.map((track) => track.id)).toEqual(['track-1', 'track-2']);
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
			playlistCreateService,
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
			playlistCreateService,
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
			playlistCreateService,
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
				playlistCreateService,
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
				playlistCreateService,
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
				playlistCreateService,
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

	describe('instant mixes', () => {
		it('builds a mix from the downloaded genre index', async () => {
			const transport = new OfflineTransport(
				createDownloadsMock({
					genres: [downloadedGenre('genre-1', ['track-1', 'track-2'])],
					tracks: [
						downloadedTrack('track-1', { complete: true }),
						downloadedTrack('track-2', { complete: true }),
						downloadedTrack('track-3', { complete: true }),
					],
				}) as never,
				playlistCreateService,
			);

			const mix = await transport.getInstantMix({ id: 'genre-1', kind: 'genre' }, 200);

			expect(mix.map((track) => track.id).sort()).toEqual(['track-1', 'track-2']);
		});

		it('mixes from the index even when the stored tracks carry no genres', async () => {
			const transport = new OfflineTransport(
				createDownloadsMock({
					genres: [downloadedGenre('genre-1', ['track-1', 'track-2'])],
					tracks: [
						downloadedTrack('track-1', { complete: true }),
						downloadedTrack('track-2', { complete: true }),
					],
				}) as never,
				playlistCreateService,
			);

			const mix = await transport.getInstantMix({ id: 'track-1', kind: 'track' }, 200);

			expect(mix.every((track) => track.genres == null)).toBe(true);
			expect(mix.map((track) => track.id).sort()).toEqual(['track-1', 'track-2']);
		});

		it('leaves incomplete downloads out of the mix', async () => {
			const transport = new OfflineTransport(
				createDownloadsMock({
					genres: [downloadedGenre('genre-1', ['track-1', 'track-2'])],
					tracks: [
						downloadedTrack('track-1', { complete: true }),
						downloadedTrack('track-2', { complete: false }),
					],
				}) as never,
				playlistCreateService,
			);

			const mix = await transport.getInstantMix({ id: 'genre-1', kind: 'genre' }, 200);

			expect(mix.map((track) => track.id)).toEqual(['track-1']);
		});

		it('puts the seed track first for a track seed', async () => {
			const transport = new OfflineTransport(
				createDownloadsMock({
					genres: [downloadedGenre('genre-1', ['track-1', 'track-2', 'track-3'])],
					tracks: [
						downloadedTrack('track-1', { complete: true }),
						downloadedTrack('track-2', { complete: true }),
						downloadedTrack('track-3', { complete: true }),
					],
				}) as never,
				playlistCreateService,
			);

			const mix = await transport.getInstantMix({ id: 'track-2', kind: 'track' }, 200);

			expect(mix[0].id).toBe('track-2');
			expect(mix).toHaveLength(3);
		});

		it("seeds an album mix from the downloaded album's genres", async () => {
			const transport = new OfflineTransport(
				createDownloadsMock({
					albums: [
						{
							album: {
								artistId: 'artist-1',
								artistName: 'Artist One',
								genres: [{ id: 'genre-1', name: 'genre-1' }],
								id: 'album-1',
								name: 'Album One',
							},
							artistLogoUrl: null,
							trackIds: ['track-1'],
						},
					],
					genres: [downloadedGenre('genre-1', ['track-1', 'track-2'])],
					tracks: [
						downloadedTrack('track-1', { albumId: 'album-1', complete: true }),
						downloadedTrack('track-2', { complete: true }),
					],
				}) as never,
				playlistCreateService,
			);

			const mix = await transport.getInstantMix({ id: 'album-1', kind: 'album' }, 200);

			expect(mix.map((track) => track.id).sort()).toEqual(['track-1', 'track-2']);
		});

		it('honours the requested limit', async () => {
			const trackIds = ['track-1', 'track-2', 'track-3', 'track-4', 'track-5'];
			const transport = new OfflineTransport(
				createDownloadsMock({
					genres: [downloadedGenre('genre-1', trackIds)],
					tracks: trackIds.map((id) => downloadedTrack(id, { complete: true })),
				}) as never,
				playlistCreateService,
			);

			const mix = await transport.getInstantMix({ id: 'genre-1', kind: 'genre' }, 2);

			expect(mix).toHaveLength(2);
		});

		it("falls back to the seed artist's other tracks when no genres are downloaded", async () => {
			const transport = new OfflineTransport(
				createDownloadsMock({
					tracks: [
						downloadedTrack('track-1', { artistId: 'artist-1', complete: true }),
						downloadedTrack('track-2', { artistId: 'artist-1', complete: true }),
						downloadedTrack('track-3', { artistId: 'artist-2', complete: true }),
					],
				}) as never,
				playlistCreateService,
			);

			const mix = await transport.getInstantMix({ id: 'track-1', kind: 'track' }, 200);

			expect(mix.map((track) => track.id).sort()).toEqual(['track-1', 'track-2']);
		});

		it('returns an empty mix when nothing is downloaded', async () => {
			const transport = new OfflineTransport(
				createDownloadsMock({}) as never,
				playlistCreateService,
			);

			const mix = await transport.getInstantMix({ id: 'track-1', kind: 'track' }, 200);

			expect(mix).toEqual([]);
		});
	});
});

function createNullStore(): {
	fetchString: () => Promise<string>;
	storeString: () => Promise<void>;
} {
	return {
		fetchString: () => Promise.reject(new Error('not found')),
		storeString: () => Promise.resolve(),
	};
}
