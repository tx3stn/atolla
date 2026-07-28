import { describe, expect, it } from 'bun:test';
import type { Track } from '../models/Track';
import { INSTANT_MIX_LIMIT } from '../transports/Transport';
import { buildGenreIndex, buildInstantMix, type InstantMixLibrary } from './InstantMix';

function makeTrack(id: string, overrides: Partial<Track> = {}): Track {
	return {
		duration: 180,
		id,
		name: id,
		...overrides,
	};
}

function makeLibrary(overrides: Partial<InstantMixLibrary> = {}): InstantMixLibrary {
	return {
		albums: [],
		artists: [],
		genres: [],
		playlists: [],
		tracks: [],
		...overrides,
	};
}

function sequenceRandom(values: Array<number>): () => number {
	let index = 0;
	return () => {
		const value = values[index] ?? 0;
		index += 1;
		return value;
	};
}

function zeroRandom(): () => number {
	return () => 0;
}

function ids(tracks: Array<Track>): Array<string> {
	return tracks.map((track) => track.id);
}

describe('buildGenreIndex', () => {
	it('inverts genre entries into genres by track id', () => {
		const index = buildGenreIndex([
			{ id: 'genre-1', trackIds: ['track-1', 'track-2'] },
			{ id: 'genre-2', trackIds: ['track-2'] },
		]);

		expect([...(index.genreIdsByTrackId.get('track-1') ?? [])]).toEqual(['genre-1']);
		expect([...(index.genreIdsByTrackId.get('track-2') ?? [])]).toEqual(['genre-1', 'genre-2']);
	});

	it('keeps track ids by genre id', () => {
		const index = buildGenreIndex([{ id: 'genre-1', trackIds: ['track-1', 'track-2'] }]);

		expect(index.trackIdsByGenreId.get('genre-1')).toEqual(['track-1', 'track-2']);
	});

	it('has no entry for a track that belongs to no genre', () => {
		const index = buildGenreIndex([{ id: 'genre-1', trackIds: [] }]);

		expect(index.genreIdsByTrackId.get('track-1')).toBeUndefined();
	});
});

describe('buildInstantMix seed genres', () => {
	it('uses the seed genre directly for a genre seed', () => {
		const library = makeLibrary({
			genres: [
				{ id: 'genre-1', trackIds: ['track-1'] },
				{ id: 'genre-2', trackIds: ['track-2'] },
			],
			tracks: [makeTrack('track-1'), makeTrack('track-2')],
		});

		const mix = buildInstantMix({ id: 'genre-1', kind: 'genre' }, library, {
			random: zeroRandom(),
		});

		expect(ids(mix)).toEqual(['track-1']);
	});

	it('uses the indexed genres of the seed track for a track seed', () => {
		const library = makeLibrary({
			genres: [
				{ id: 'genre-1', trackIds: ['track-1', 'track-2'] },
				{ id: 'genre-2', trackIds: ['track-3'] },
			],
			tracks: [makeTrack('track-1'), makeTrack('track-2'), makeTrack('track-3')],
		});

		const mix = buildInstantMix({ id: 'track-1', kind: 'track' }, library, {
			random: zeroRandom(),
		});

		expect(ids(mix)).toEqual(['track-1', 'track-2']);
	});

	it('reads genres from the index rather than the stored track', () => {
		const library = makeLibrary({
			genres: [{ id: 'genre-1', trackIds: ['track-1', 'track-2'] }],
			tracks: [makeTrack('track-1', { genres: [] }), makeTrack('track-2', { genres: [] })],
		});

		const mix = buildInstantMix({ id: 'track-1', kind: 'track' }, library, {
			random: zeroRandom(),
		});

		expect(ids(mix)).toEqual(['track-1', 'track-2']);
	});

	it("falls back to the album's genres when the index has none for the seed track", () => {
		const library = makeLibrary({
			albums: [{ genreIds: ['genre-1'], id: 'album-1', trackIds: ['track-1'] }],
			genres: [{ id: 'genre-1', trackIds: ['track-2'] }],
			tracks: [makeTrack('track-1', { albumId: 'album-1' }), makeTrack('track-2')],
		});

		const mix = buildInstantMix({ id: 'track-1', kind: 'track' }, library, {
			random: zeroRandom(),
		});

		expect(ids(mix)).toEqual(['track-1', 'track-2']);
	});

	it("falls back to the artist's other tracks' genres when neither index nor album has any", () => {
		const library = makeLibrary({
			genres: [{ id: 'genre-1', trackIds: ['track-2', 'track-3'] }],
			tracks: [
				makeTrack('track-1', { artistId: 'artist-1' }),
				makeTrack('track-2', { artistId: 'artist-1' }),
				makeTrack('track-3', { artistId: 'artist-2' }),
			],
		});

		const mix = buildInstantMix({ id: 'track-1', kind: 'track' }, library, {
			random: zeroRandom(),
		});

		expect(ids(mix).slice(0, 1)).toEqual(['track-1']);
		expect(ids(mix).slice(1).sort()).toEqual(['track-2', 'track-3']);
	});

	it("uses the album's own genres for an album seed", () => {
		const library = makeLibrary({
			albums: [{ genreIds: ['genre-1'], id: 'album-1', trackIds: ['track-1'] }],
			genres: [{ id: 'genre-1', trackIds: ['track-1', 'track-2'] }],
			tracks: [makeTrack('track-1'), makeTrack('track-2')],
		});

		const mix = buildInstantMix({ id: 'album-1', kind: 'album' }, library, {
			random: zeroRandom(),
		});

		expect(ids(mix).sort()).toEqual(['track-1', 'track-2']);
	});

	it("falls back to the indexed genres of an album's tracks", () => {
		const library = makeLibrary({
			albums: [{ genreIds: [], id: 'album-1', trackIds: ['track-1'] }],
			genres: [{ id: 'genre-1', trackIds: ['track-1', 'track-2'] }],
			tracks: [makeTrack('track-1'), makeTrack('track-2')],
		});

		const mix = buildInstantMix({ id: 'album-1', kind: 'album' }, library, {
			random: zeroRandom(),
		});

		expect(ids(mix).sort()).toEqual(['track-1', 'track-2']);
	});

	it("unions the genres of an artist's tracks for an artist seed", () => {
		const library = makeLibrary({
			albums: [{ genreIds: [], id: 'album-1', trackIds: ['track-1'] }],
			artists: [{ albumIds: ['album-1'], id: 'artist-1' }],
			genres: [
				{ id: 'genre-1', trackIds: ['track-1', 'track-3'] },
				{ id: 'genre-2', trackIds: ['track-2', 'track-4'] },
			],
			tracks: [
				makeTrack('track-1', { artistId: 'artist-1' }),
				makeTrack('track-2', { artistId: 'artist-1' }),
				makeTrack('track-3'),
				makeTrack('track-4'),
			],
		});

		const mix = buildInstantMix({ id: 'artist-1', kind: 'artist' }, library, {
			random: zeroRandom(),
		});

		expect(ids(mix).sort()).toEqual(['track-1', 'track-2', 'track-3', 'track-4']);
	});

	it("derives an album seed's tracks when the album itself is not downloaded", () => {
		const library = makeLibrary({
			genres: [{ id: 'genre-1', trackIds: ['track-1', 'track-2'] }],
			tracks: [makeTrack('track-1', { albumId: 'album-1' }), makeTrack('track-2')],
		});

		const mix = buildInstantMix({ id: 'album-1', kind: 'album' }, library, {
			random: zeroRandom(),
		});

		expect(ids(mix).sort()).toEqual(['track-1', 'track-2']);
	});

	it("includes the tracks of an artist's downloaded albums that carry no artist of their own", () => {
		const library = makeLibrary({
			albums: [{ genreIds: [], id: 'album-1', trackIds: ['track-1'] }],
			artists: [{ albumIds: ['album-1'], id: 'artist-1' }],
			genres: [{ id: 'genre-1', trackIds: ['track-1', 'track-2'] }],
			tracks: [makeTrack('track-1'), makeTrack('track-2')],
		});

		const mix = buildInstantMix({ id: 'artist-1', kind: 'artist' }, library, {
			random: zeroRandom(),
		});

		expect(ids(mix).sort()).toEqual(['track-1', 'track-2']);
	});

	it("unions the genres of a playlist's tracks for a playlist seed", () => {
		const library = makeLibrary({
			genres: [{ id: 'genre-1', trackIds: ['track-1', 'track-2'] }],
			playlists: [{ id: 'playlist-1', trackIds: ['track-1'] }],
			tracks: [makeTrack('track-1'), makeTrack('track-2'), makeTrack('track-3')],
		});

		const mix = buildInstantMix({ id: 'playlist-1', kind: 'playlist' }, library, {
			random: zeroRandom(),
		});

		expect(ids(mix).sort()).toEqual(['track-1', 'track-2']);
	});
});

describe('buildInstantMix ranking', () => {
	it('ranks tracks sharing more seed genres above tracks sharing fewer', () => {
		const library = makeLibrary({
			genres: [
				{ id: 'genre-1', trackIds: ['track-1', 'track-2', 'track-3'] },
				{ id: 'genre-2', trackIds: ['track-1', 'track-3'] },
			],
			tracks: [makeTrack('track-1'), makeTrack('track-2'), makeTrack('track-3')],
		});

		const mix = buildInstantMix({ id: 'track-1', kind: 'track' }, library, {
			random: zeroRandom(),
		});

		expect(ids(mix)).toEqual(['track-1', 'track-3', 'track-2']);
	});

	it('shuffles within a score band using the injected random', () => {
		const library = makeLibrary({
			genres: [{ id: 'genre-1', trackIds: ['track-1', 'track-2', 'track-3'] }],
			tracks: [makeTrack('track-1'), makeTrack('track-2'), makeTrack('track-3')],
		});

		const mix = buildInstantMix({ id: 'genre-1', kind: 'genre' }, library, {
			random: sequenceRandom([0.99, 0.99, 0.99]),
		});

		expect(ids(mix)).toEqual(['track-3', 'track-1', 'track-2']);
	});

	it('produces a different order for a different random sequence', () => {
		const library = makeLibrary({
			genres: [{ id: 'genre-1', trackIds: ['track-1', 'track-2', 'track-3'] }],
			tracks: [makeTrack('track-1'), makeTrack('track-2'), makeTrack('track-3')],
		});

		const mix = buildInstantMix({ id: 'genre-1', kind: 'genre' }, library, {
			random: zeroRandom(),
		});

		expect(ids(mix)).toEqual(['track-1', 'track-2', 'track-3']);
	});

	it('puts the seed track first and does not repeat it in the remainder', () => {
		const library = makeLibrary({
			genres: [{ id: 'genre-1', trackIds: ['track-1', 'track-2', 'track-3'] }],
			tracks: [makeTrack('track-1'), makeTrack('track-2'), makeTrack('track-3')],
		});

		const mix = buildInstantMix({ id: 'track-3', kind: 'track' }, library, {
			random: zeroRandom(),
		});

		expect(mix[0]?.id).toBe('track-3');
		expect(ids(mix).filter((id) => id === 'track-3')).toEqual(['track-3']);
	});

	it('caps the mix at the shared instant mix limit', () => {
		const trackIds = Array.from({ length: INSTANT_MIX_LIMIT + 50 }, (_, i) => `track-${i}`);
		const library = makeLibrary({
			genres: [{ id: 'genre-1', trackIds }],
			tracks: trackIds.map((id) => makeTrack(id)),
		});

		const mix = buildInstantMix({ id: 'genre-1', kind: 'genre' }, library, {
			random: zeroRandom(),
		});

		expect(mix.length).toBe(INSTANT_MIX_LIMIT);
	});

	it('honours an explicit limit, counting the seed track towards it', () => {
		const trackIds = Array.from({ length: 10 }, (_, i) => `track-${i}`);
		const library = makeLibrary({
			genres: [{ id: 'genre-1', trackIds }],
			tracks: trackIds.map((id) => makeTrack(id)),
		});

		const mix = buildInstantMix({ id: 'track-0', kind: 'track' }, library, {
			limit: 4,
			random: zeroRandom(),
		});

		expect(mix.length).toBe(4);
		expect(mix[0]?.id).toBe('track-0');
	});

	it('skips indexed track ids with no downloaded track', () => {
		const library = makeLibrary({
			genres: [{ id: 'genre-1', trackIds: ['track-1', 'track-missing'] }],
			tracks: [makeTrack('track-1')],
		});

		const mix = buildInstantMix({ id: 'genre-1', kind: 'genre' }, library, {
			random: zeroRandom(),
		});

		expect(ids(mix)).toEqual(['track-1']);
	});
});

describe('buildInstantMix spread', () => {
	function multiAlbumLibrary(): InstantMixLibrary {
		return makeLibrary({
			albums: [
				{ genreIds: ['genre-1'], id: 'album-1', trackIds: ['a1', 'a2', 'a3', 'a4'] },
				{ genreIds: ['genre-1'], id: 'album-2', trackIds: ['b1', 'b2'] },
				{ genreIds: ['genre-1'], id: 'album-3', trackIds: ['c1', 'c2'] },
			],
			genres: [{ id: 'genre-1', trackIds: ['a1', 'a2', 'a3', 'a4', 'b1', 'b2', 'c1', 'c2'] }],
			tracks: [
				makeTrack('a1', { albumId: 'album-1' }),
				makeTrack('a2', { albumId: 'album-1' }),
				makeTrack('a3', { albumId: 'album-1' }),
				makeTrack('a4', { albumId: 'album-1' }),
				makeTrack('b1', { albumId: 'album-2' }),
				makeTrack('b2', { albumId: 'album-2' }),
				makeTrack('c1', { albumId: 'album-3' }),
				makeTrack('c2', { albumId: 'album-3' }),
			],
		});
	}

	it("spreads the seed album's remaining tracks through the mix", () => {
		const mix = buildInstantMix({ id: 'album-1', kind: 'album' }, multiAlbumLibrary(), {
			random: zeroRandom(),
		});

		expect(ids(mix)).toEqual(['a1', 'b1', 'c1', 'a2', 'b2', 'c2', 'a3', 'a4']);
	});

	it('takes at most one track per album before revisiting an album', () => {
		const mix = buildInstantMix({ id: 'genre-1', kind: 'genre' }, multiAlbumLibrary(), {
			limit: 3,
			random: zeroRandom(),
		});

		expect(ids(mix).map((id) => id[0])).toEqual(['a', 'b', 'c']);
	});

	it('keeps filling from one album when it is the only one downloaded', () => {
		const library = makeLibrary({
			albums: [{ genreIds: ['genre-1'], id: 'album-1', trackIds: ['a1', 'a2', 'a3'] }],
			genres: [{ id: 'genre-1', trackIds: ['a1', 'a2', 'a3'] }],
			tracks: [
				makeTrack('a1', { albumId: 'album-1' }),
				makeTrack('a2', { albumId: 'album-1' }),
				makeTrack('a3', { albumId: 'album-1' }),
			],
		});

		const mix = buildInstantMix({ id: 'album-1', kind: 'album' }, library, {
			random: zeroRandom(),
		});

		expect(ids(mix)).toEqual(['a1', 'a2', 'a3']);
	});

	it('groups by artist when the candidates carry no album', () => {
		const library = makeLibrary({
			genres: [{ id: 'genre-1', trackIds: ['x1', 'x2', 'y1'] }],
			tracks: [
				makeTrack('x1', { artistId: 'artist-x' }),
				makeTrack('x2', { artistId: 'artist-x' }),
				makeTrack('y1', { artistId: 'artist-y' }),
			],
		});

		const mix = buildInstantMix({ id: 'genre-1', kind: 'genre' }, library, {
			random: zeroRandom(),
		});

		expect(ids(mix)).toEqual(['x1', 'y1', 'x2']);
	});
});

describe('buildInstantMix fallbacks', () => {
	it("falls back to the seed artist's other tracks when no genre overlaps", () => {
		const library = makeLibrary({
			tracks: [
				makeTrack('track-1', { artistId: 'artist-1' }),
				makeTrack('track-2', { artistId: 'artist-1' }),
				makeTrack('track-3', { artistId: 'artist-2' }),
			],
		});

		const mix = buildInstantMix({ id: 'track-1', kind: 'track' }, library, {
			random: zeroRandom(),
		});

		expect(ids(mix)).toEqual(['track-1', 'track-2']);
	});

	it('falls back to the seed album when the artist has no other tracks', () => {
		const library = makeLibrary({
			tracks: [
				makeTrack('track-1', { albumId: 'album-1' }),
				makeTrack('track-2', { albumId: 'album-1' }),
				makeTrack('track-3', { albumId: 'album-2' }),
			],
		});

		const mix = buildInstantMix({ id: 'track-1', kind: 'track' }, library, {
			random: zeroRandom(),
		});

		expect(ids(mix)).toEqual(['track-1', 'track-2']);
	});

	it("falls back to other tracks by an album seed's artist", () => {
		const library = makeLibrary({
			albums: [{ genreIds: [], id: 'album-1', trackIds: ['track-1'] }],
			tracks: [
				makeTrack('track-1', { albumId: 'album-1', artistId: 'artist-1' }),
				makeTrack('track-2', { albumId: 'album-2', artistId: 'artist-1' }),
				makeTrack('track-3', { albumId: 'album-3', artistId: 'artist-2' }),
			],
		});

		const mix = buildInstantMix({ id: 'album-1', kind: 'album' }, library, {
			random: zeroRandom(),
		});

		expect(ids(mix).sort()).toEqual(['track-1', 'track-2']);
	});

	it('falls back to random library tracks when nothing relates to the seed', () => {
		const library = makeLibrary({
			tracks: [makeTrack('track-1'), makeTrack('track-2'), makeTrack('track-3')],
		});

		const mix = buildInstantMix({ id: 'genre-unknown', kind: 'genre' }, library, {
			random: zeroRandom(),
		});

		expect(ids(mix).sort()).toEqual(['track-1', 'track-2', 'track-3']);
	});

	it('still returns the seed track when it is the only download', () => {
		const library = makeLibrary({ tracks: [makeTrack('track-1')] });

		const mix = buildInstantMix({ id: 'track-1', kind: 'track' }, library, {
			random: zeroRandom(),
		});

		expect(ids(mix)).toEqual(['track-1']);
	});

	it('returns an empty mix when there are no downloads', () => {
		const mix = buildInstantMix({ id: 'track-1', kind: 'track' }, makeLibrary(), {
			random: zeroRandom(),
		});

		expect(mix).toEqual([]);
	});
});

describe('buildInstantMix lead track', () => {
	function albumLibrary(): InstantMixLibrary {
		return makeLibrary({
			albums: [{ genreIds: ['genre-1'], id: 'album-1', trackIds: ['track-5'] }],
			genres: [{ id: 'genre-1', trackIds: ['track-1', 'track-2', 'track-3', 'track-5'] }],
			tracks: [
				makeTrack('track-1'),
				makeTrack('track-2'),
				makeTrack('track-3'),
				makeTrack('track-5', { albumId: 'album-1' }),
			],
		});
	}

	it('leads an album seed with a track from that album', () => {
		const mix = buildInstantMix({ id: 'album-1', kind: 'album' }, albumLibrary(), {
			random: zeroRandom(),
		});

		expect(mix[0]?.id).toBe('track-5');
	});

	it('does not repeat the album lead track in the remainder', () => {
		const mix = buildInstantMix({ id: 'album-1', kind: 'album' }, albumLibrary(), {
			random: zeroRandom(),
		});

		expect(ids(mix).filter((id) => id === 'track-5')).toEqual(['track-5']);
	});

	it('counts the album lead track towards the limit', () => {
		const mix = buildInstantMix({ id: 'album-1', kind: 'album' }, albumLibrary(), {
			limit: 2,
			random: zeroRandom(),
		});

		expect(ids(mix)).toEqual(['track-5', 'track-1']);
	});

	it('leads an artist seed with a track by that artist', () => {
		const library = makeLibrary({
			genres: [{ id: 'genre-1', trackIds: ['track-1', 'track-2', 'track-3'] }],
			tracks: [
				makeTrack('track-1'),
				makeTrack('track-2'),
				makeTrack('track-3', { artistId: 'artist-1' }),
			],
		});

		const mix = buildInstantMix({ id: 'artist-1', kind: 'artist' }, library, {
			random: zeroRandom(),
		});

		expect(mix[0]?.id).toBe('track-3');
	});

	it('leaves the mix unled when none of the seed album is downloaded', () => {
		const library = makeLibrary({
			albums: [{ genreIds: ['genre-1'], id: 'album-1', trackIds: ['track-missing'] }],
			genres: [{ id: 'genre-1', trackIds: ['track-1', 'track-2'] }],
			tracks: [makeTrack('track-1'), makeTrack('track-2')],
		});

		const mix = buildInstantMix({ id: 'album-1', kind: 'album' }, library, {
			random: zeroRandom(),
		});

		expect(ids(mix)).toEqual(['track-1', 'track-2']);
	});
});
