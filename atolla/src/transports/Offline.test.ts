import { describe, expect, it } from 'bun:test';
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
});
