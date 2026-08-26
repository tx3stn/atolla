import { describe, expect, it } from 'bun:test';
import type { Track } from 'atolla_core/src/models/Track';
import type { Transport } from 'atolla_core/src/transports/Transport';
import { entityTrackSource } from './EntityTracks';

function makeTracks(ids: Array<string>): Array<Track> {
	return ids.map((id) => ({ duration: 100, id, name: `Track ${id}` }));
}

interface PagedCall {
	id: string;
	page: number;
	pageSize: number;
	sort: string | undefined;
}

function mockTransport(calls: Array<PagedCall>): Transport {
	return {
		getTracksByAlbum: (albumId: string) => Promise.resolve(makeTracks([`${albumId}-1`])),
		getTracksByArtist: (artistId: string) => Promise.resolve(makeTracks([`${artistId}-1`])),
		getTracksByGenre: (
			genreId: string,
			page: number,
			pageSize: number,
			options?: { sort?: string },
		) => {
			calls.push({ id: genreId, page, pageSize, sort: options?.sort });
			return Promise.resolve({ hasMore: page < 2, items: makeTracks([`${genreId}-${page}`]) });
		},
		getTracksByPlaylist: (
			playlistId: string,
			page: number,
			pageSize: number,
			options?: { sort?: string },
		) => {
			calls.push({ id: playlistId, page, pageSize, sort: options?.sort });
			return Promise.resolve({ hasMore: page < 2, items: makeTracks([`${playlistId}-${page}`]) });
		},
	} as unknown as Transport;
}

const album = { artistId: 'ar1', artistName: 'Artist', id: 'al1', name: 'Album' };
const artist = { id: 'ar1', name: 'Artist' };
const genre = { id: 'g1', name: 'Genre' };
const playlist = { id: 'p1', name: 'Playlist' };

describe('entityTrackSource', () => {
	it('reads an album as a single page', async () => {
		const source = entityTrackSource({ album, kind: 'album' }, mockTransport([]));

		expect(await source(1, 50)).toEqual({ hasMore: false, items: makeTracks(['al1-1']) });
		expect(await source(2, 50)).toEqual({ hasMore: false, items: [] });
	});

	it('reads an artist as a single page', async () => {
		const source = entityTrackSource({ artist, kind: 'artist' }, mockTransport([]));

		expect(await source(1, 50)).toEqual({ hasMore: false, items: makeTracks(['ar1-1']) });
	});

	it('pages a genre', async () => {
		const calls: Array<PagedCall> = [];
		const source = entityTrackSource({ genre, kind: 'genre' }, mockTransport(calls));

		expect(await source(1, 25)).toEqual({ hasMore: true, items: makeTracks(['g1-1']) });
		expect(await source(2, 25)).toEqual({ hasMore: false, items: makeTracks(['g1-2']) });
		expect(calls).toEqual([
			{ id: 'g1', page: 1, pageSize: 25, sort: undefined },
			{ id: 'g1', page: 2, pageSize: 25, sort: undefined },
		]);
	});

	it('pages a playlist', async () => {
		const calls: Array<PagedCall> = [];
		const source = entityTrackSource({ kind: 'playlist', playlist }, mockTransport(calls));

		expect(await source(1, 25)).toEqual({ hasMore: true, items: makeTracks(['p1-1']) });
		expect(calls).toEqual([{ id: 'p1', page: 1, pageSize: 25, sort: undefined }]);
	});

	it('forwards the sort to the paged reads', async () => {
		const calls: Array<PagedCall> = [];
		const transport = mockTransport(calls);

		await entityTrackSource({ genre, kind: 'genre' }, transport, { sort: 'random' })(1, 50);
		await entityTrackSource({ kind: 'playlist', playlist }, transport, { sort: 'random' })(1, 50);

		expect(calls.map((call) => call.sort)).toEqual(['random', 'random']);
	});
});
