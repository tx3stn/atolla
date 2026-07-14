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

			const [albumsPage, artistsPage, playlistsPage] = await Promise.all([
				transport.getAlbums(1, 50),
				transport.getArtists(1, 50),
				transport.getPlaylists(1, 50),
			]);

			expect(albumsPage.items.length).toBeGreaterThan(0);
			expect(artistsPage.items.length).toBeGreaterThan(0);
			expect(playlistsPage.items.length).toBeGreaterThan(0);

			const [albumTracks, artistTracks, playlistPage] = await Promise.all([
				transport.getTracksByAlbum(albumsPage.items[0].id),
				transport.getTracksByArtist(artistsPage.items[0].id),
				transport.getTracksByPlaylist(playlistsPage.items[0].id, 1, 50),
			]);
			const playlistTracks = playlistPage.items;

			expect(albumTracks.length).toBeGreaterThan(0);
			expect(artistTracks.length).toBeGreaterThan(0);
			expect(playlistTracks.length).toBeGreaterThan(0);

			albumTracks.forEach(assertTrackContract);
			artistTracks.forEach(assertTrackContract);
			playlistTracks.forEach(assertTrackContract);
		});

		it('resolves a single genre and playlist by id for detail-view self-heal', async () => {
			const transport = createTransport();
			const [genresPage, playlistsPage] = await Promise.all([
				transport.getGenres(1, 50),
				transport.getPlaylists(1, 50),
			]);
			expect(genresPage.items.length).toBeGreaterThan(0);
			expect(playlistsPage.items.length).toBeGreaterThan(0);

			const genre = await transport.getGenre(genresPage.items[0].id);
			const playlist = await transport.getPlaylist(playlistsPage.items[0].id);

			expect(genre?.id).toBe(genresPage.items[0].id);
			expect(playlist?.id).toBe(playlistsPage.items[0].id);
		});

		it('keeps release metadata stable for same track across endpoints', async () => {
			const transport = createTransport();
			const playlists = (await transport.getPlaylists(1, 50)).items;
			expect(playlists.length).toBeGreaterThan(0);

			const playlistTracks = (await transport.getTracksByPlaylist(playlists[0].id, 1, 50)).items;
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

		it('narrows album, artist and playlist pages by a startsWith prefix', async () => {
			const transport = createTransport();

			const [albums, artists, playlists] = await Promise.all([
				transport.getAlbums(1, 50).then((page) => page.items),
				transport.getArtists(1, 50).then((page) => page.items),
				transport.getPlaylists(1, 50).then((page) => page.items),
			]);

			const prefixOf = (name: string): string => name.trim().charAt(0).toLowerCase();
			const albumPrefix = albums.map((a) => prefixOf(a.name)).find((p) => /[a-z]/.test(p));
			expect(albumPrefix).toBeDefined();
			if (!albumPrefix) {
				return;
			}

			const filtered = await transport.getAlbums(1, 50, { startsWith: albumPrefix });
			expect(filtered.items.length).toBeGreaterThan(0);
			filtered.items.forEach((album) => {
				expect(prefixOf(album.name)).toBe(albumPrefix);
			});

			// the prefix filter must not change the shape of the result set type for
			// artists/playlists either; exercise them so every transport honours the arg
			await transport.getArtists(1, 50, { startsWith: prefixOf(artists[0].name) });
			await transport.getPlaylists(1, 50, { startsWith: prefixOf(playlists[0].name) });
		});

		it('returns contract-compliant tracks for a randomly picked populated year', async () => {
			const transport = createTransport();

			const years = await transport.getRandomMusicYears(3);
			expect(years.length).toBeGreaterThan(0);
			const year = years[0];

			const page = await transport.getTracksByYear(year, 1, 50);
			expect(page.items.length).toBeGreaterThan(0);
			page.items.forEach(assertTrackContract);
			page.items.forEach((track) => {
				expect(
					track.productionYear ?? Number.parseInt(track.releaseDate?.slice(0, 4) ?? '', 10),
				).toBe(year);
			});
		});

		it('returns genre pages and genre tracks with contract-compliant tracks', async () => {
			const transport = createTransport();
			const genresPage = await transport.getGenres(1, 5);
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
