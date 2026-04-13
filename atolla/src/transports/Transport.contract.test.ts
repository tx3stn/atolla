import { describe, expect, it } from 'bun:test';
import type { Track } from '../models/Track';
import { MockTransport } from './Mock';
import type { Transport } from './Transport';

function assertTrackContract(track: Track): void {
	expect(typeof track.id).toBe('string');
	expect(track.id.length).toBeGreaterThan(0);
	expect(typeof track.name).toBe('string');
	expect(track.name.length).toBeGreaterThan(0);
	expect(typeof track.duration).toBe('number');
	expect(track.duration).toBeGreaterThanOrEqual(0);
	if (track.releaseDate !== undefined) {
		expect(typeof track.releaseDate).toBe('string');
	}
	if (track.productionYear !== undefined) {
		expect(typeof track.productionYear).toBe('number');
	}
}

function runTransportTrackContractSuite(name: string, createTransport: () => Transport): void {
	describe(`${name} track contract`, () => {
		it('returns contract-compliant tracks from album, artist and playlist endpoints', async () => {
			const transport = createTransport();

			const [albums, artists, playlists] = await Promise.all([
				transport.getAllAlbums(),
				transport.getAllArtists(),
				transport.getAllPlaylists(),
			]);

			expect(albums.length).toBeGreaterThan(0);
			expect(artists.length).toBeGreaterThan(0);
			expect(playlists.length).toBeGreaterThan(0);

			const [albumTracks, artistTracks, playlistTracks] = await Promise.all([
				transport.getTracksByAlbum(albums[0].id),
				transport.getTracksByArtist(artists[0].id),
				transport.getTracksByPlaylist(playlists[0].id),
			]);

			expect(albumTracks.length).toBeGreaterThan(0);
			expect(artistTracks.length).toBeGreaterThan(0);
			expect(playlistTracks.length).toBeGreaterThan(0);

			albumTracks.forEach(assertTrackContract);
			artistTracks.forEach(assertTrackContract);
			playlistTracks.forEach(assertTrackContract);
		});

		it('keeps release metadata stable for same track across endpoints', async () => {
			const transport = createTransport();
			const playlists = await transport.getAllPlaylists();
			expect(playlists.length).toBeGreaterThan(0);

			const playlistTracks = await transport.getTracksByPlaylist(playlists[0].id);
			expect(playlistTracks.length).toBeGreaterThan(0);

			const playlistTrack = playlistTracks.find((track) => Boolean(track.albumId));
			expect(playlistTrack).toBeDefined();
			if (!playlistTrack?.albumId) {
				return;
			}

			const albumTracks = await transport.getTracksByAlbum(playlistTrack.albumId);
			const matchingAlbumTrack = albumTracks.find((track) => track.id === playlistTrack.id);
			expect(matchingAlbumTrack).toBeDefined();

			expect(matchingAlbumTrack?.releaseDate).toBe(playlistTrack.releaseDate);
			expect(matchingAlbumTrack?.productionYear).toBe(playlistTrack.productionYear);
		});

		it('returns genre pages and genre tracks with contract-compliant tracks', async () => {
			const transport = createTransport();
			const genresPage = await transport.getGenresPage(1, 5);
			expect(genresPage.items.length).toBeGreaterThan(0);

			const genre = genresPage.items[0];
			expect(typeof genre.id).toBe('string');
			expect(genre.id.length).toBeGreaterThan(0);
			expect(typeof genre.name).toBe('string');

			const genreTracks = await transport.getTracksByGenre(genre.id);
			expect(genreTracks.length).toBeGreaterThan(0);
			genreTracks.forEach(assertTrackContract);
		});
	});
}

runTransportTrackContractSuite('MockTransport', () => new MockTransport());
