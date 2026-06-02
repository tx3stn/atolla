import { describe, expect, it } from 'bun:test';
import { MockTransport } from './Mock';

describe('MockTransport.search', () => {
	it('returns empty arrays for blank query', async () => {
		const transport = new MockTransport();
		const results = await transport.search('   ');

		expect(results.albums).toEqual([]);
		expect(results.artists).toEqual([]);
		expect(results.playlists).toEqual([]);
		expect(results.tracks).toEqual([]);
	});

	it('matches entity names case-insensitively', async () => {
		const transport = new MockTransport();
		const artistResults = await transport.search('CONVERGE');
		const albumResults = await transport.search('jane doe');
		const trackResults = await transport.search('JANE DOE');
		const playlistResults = await transport.search('converge essentials');

		expect(artistResults.artists.some((artist) => artist.name === 'Converge')).toBe(true);
		expect(albumResults.albums.some((album) => album.name === 'Jane Doe')).toBe(true);
		expect(trackResults.tracks.some((track) => track.name === 'Jane Doe')).toBe(true);
		expect(
			playlistResults.playlists.some((playlist) => playlist.name === 'Converge Essentials'),
		).toBe(true);
	});

	it('supports partial substring matching', async () => {
		const transport = new MockTransport();
		const results = await transport.search('rat');

		expect(results.albums.some((album) => album.name === 'RAT WARS')).toBe(true);
		expect(results.tracks.some((track) => track.name === 'RAT WARS')).toBe(true);
	});
});

describe('MockTransport pagination', () => {
	it('paginates artists and playlists', async () => {
		const transport = new MockTransport();

		const artistsPage = await transport.getArtistsPage(1, 2);
		const genresPage = await transport.getGenresPage(1, 3);
		const genreTracksPage = await transport.getTracksByGenrePage('genre-1', 1, 2);
		const playlistsPage = await transport.getPlaylistsPage(1, 1);

		expect(artistsPage.items.length).toBe(2);
		expect(artistsPage.hasMore).toBe(true);
		expect(genresPage.items.length).toBe(3);
		expect(genresPage.hasMore).toBe(true);
		expect(genreTracksPage.items.length).toBe(2);
		expect(genreTracksPage.totalCount).toBeGreaterThan(0);
		expect(playlistsPage.items.length).toBe(1);
		expect(typeof playlistsPage.hasMore).toBe('boolean');
	});

	it('orders albums by release date descending for all and paged responses', async () => {
		const transport = new MockTransport();

		const allAlbums = (await transport.getAlbumsPage(1, 1000)).items;
		const firstPage = await transport.getAlbumsPage(1, 5);

		expect(firstPage.items.map((album) => album.id)).toEqual(
			allAlbums.slice(0, 5).map((album) => album.id),
		);

		for (let index = 0; index < allAlbums.length - 1; index++) {
			const current = allAlbums[index].releaseDate;
			const next = allAlbums[index + 1].releaseDate;

			if (!current) {
				expect(next).toBeUndefined();
				continue;
			}

			if (!next) {
				continue;
			}

			expect(Date.parse(current)).toBeGreaterThanOrEqual(Date.parse(next));
		}
	});
});

describe('MockTransport playlist reorder', () => {
	it('exposes a playlistItemId for each playlist track', async () => {
		const transport = new MockTransport();
		const tracks = await transport.getTracksByPlaylist('playlist-1');

		expect(tracks.length).toBeGreaterThan(1);
		for (const track of tracks) {
			expect(track.playlistItemId).toBe(track.id);
		}
	});

	it('persists a reordered playlist track for the session', async () => {
		const transport = new MockTransport();
		const before = await transport.getTracksByPlaylist('playlist-1');
		const movedId = before[0].playlistItemId;
		expect(movedId).toBeDefined();

		await transport.movePlaylistTrack('playlist-1', movedId ?? '', 2);

		const after = await transport.getTracksByPlaylist('playlist-1');
		expect(after.map((track) => track.id)).toEqual([
			before[1].id,
			before[2].id,
			before[0].id,
			before[3].id,
		]);
	});

	it('reflects the reorder through getTracksByPlaylistPage', async () => {
		const transport = new MockTransport();
		const before = await transport.getTracksByPlaylist('playlist-1');
		const movedId = before[0].playlistItemId ?? '';

		await transport.movePlaylistTrack('playlist-1', movedId, 2);

		const page = await transport.getTracksByPlaylistPage('playlist-1', 1, 10);
		expect(page.items[2].id).toBe(before[0].id);
	});

	it('does not leak reorder state across transport instances', async () => {
		const transport = new MockTransport();
		const original = await transport.getTracksByPlaylist('playlist-1');
		await transport.movePlaylistTrack('playlist-1', original[0].playlistItemId ?? '', 2);

		const fresh = await new MockTransport().getTracksByPlaylist('playlist-1');
		expect(fresh.map((track) => track.id)).toEqual(original.map((track) => track.id));
	});
});
