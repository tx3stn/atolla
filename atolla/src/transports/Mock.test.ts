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
