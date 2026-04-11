import { describe, expect, it } from 'bun:test';
import { TransportErrors } from '../errors/TransportErrors';
import type {
	DownloadedAlbumEntry,
	DownloadedArtistEntry,
	DownloadedPlaylistEntry,
	DownloadedTrackEntry,
} from '../services/DownloadService';
import { OfflineTransport } from './Offline';

function createDownloadsMock(params: {
	albums?: Array<DownloadedAlbumEntry>;
	artistEntry?: DownloadedArtistEntry;
	playlists?: Array<DownloadedPlaylistEntry>;
	tracks?: Array<DownloadedTrackEntry>;
}) {
	const albums = params.albums ?? [];
	const playlists = params.playlists ?? [];
	const tracks = params.tracks ?? [];
	const artistById: Record<string, DownloadedArtistEntry> = params.artistEntry
		? { [params.artistEntry.artist.id]: params.artistEntry }
		: {};
	const albumById = new Map(albums.map((entry) => [entry.album.id, entry]));
	const playlistById = new Map(playlists.map((entry) => [entry.playlist.id, entry]));
	const trackById = new Map(tracks.map((entry) => [entry.track.id, entry]));

	return {
		getAlbum: (albumId: string) => albumById.get(albumId),
		getAllAlbums: () => albums,
		getAllArtists: () => [],
		getAllPlaylists: () => playlists,
		getAllTracks: () => tracks,
		getArtist: (artistId: string) => artistById[artistId],
		getPlaylist: (playlistId: string) => playlistById.get(playlistId),
		getTrack: (trackId: string) => trackById.get(trackId),
		getTrackPlaybackUrl: () => '',
		isTrackDownloaded: () => false,
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
						complete: true,
						playlistIds: ['playlist-1'],
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
						complete: true,
						playlistIds: ['playlist-1'],
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
				],
			}) as never,
		);

		const artists = await transport.getAllArtists();
		const albums = await transport.getAllAlbums();
		const albumsByArtist = await transport.getAlbumsByArtist('artist-1');
		const tracksByArtist = await transport.getTracksByArtist('artist-1');
		const tracksByAlbum = await transport.getTracksByAlbum('album-1');

		expect(artists).toEqual([{ id: 'artist-1', name: 'Artist One' }]);
		expect(albums).toEqual([
			{
				artistId: 'artist-1',
				artistName: 'Artist One',
				id: 'album-1',
				imageUrl: 'https://img/album-1.jpg',
				name: 'Album One',
			},
		]);
		expect(albumsByArtist).toEqual(albums);
		expect(tracksByArtist.map((track) => track.id)).toEqual(['track-1']);
		expect(tracksByAlbum.map((track) => track.id)).toEqual(['track-1']);
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

		const artists = await transport.getAllArtists();

		expect(artists).toEqual([
			{
				id: 'artist-1',
				logoUrl: 'https://img/logo-artist-1.png',
				name: 'Artist One',
			},
		]);
	});
});
