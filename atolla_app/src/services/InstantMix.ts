import type { Track } from 'atolla_core/src/models/Track';
import { INSTANT_MIX_LIMIT, type InstantMixSeed } from 'atolla_core/src/transports/Transport';

export interface GenreIndex {
	genreIdsByTrackId: Map<string, Array<string>>;
	trackIdsByGenreId: Map<string, Array<string>>;
}

export interface InstantMixAlbumEntry {
	genreIds: Array<string>;
	id: string;
	trackIds: Array<string>;
}

export interface InstantMixArtistEntry {
	albumIds: Array<string>;
	id: string;
}

export interface InstantMixCollectionEntry {
	id: string;
	trackIds: Array<string>;
}

export interface InstantMixLibrary {
	albums: Array<InstantMixAlbumEntry>;
	artists: Array<InstantMixArtistEntry>;
	genres: Array<InstantMixCollectionEntry>;
	playlists: Array<InstantMixCollectionEntry>;
	tracks: Array<Track>;
}

export interface InstantMixOptions {
	limit?: number;
	random?: () => number;
}

interface MixContext {
	index: GenreIndex;
	library: InstantMixLibrary;
	random: () => number;
	tracksById: Map<string, Track>;
}

export function buildGenreIndex(genres: Array<InstantMixCollectionEntry>): GenreIndex {
	const genreIdsByTrackId = new Map<string, Array<string>>();
	const trackIdsByGenreId = new Map<string, Array<string>>();

	for (const entry of genres) {
		trackIdsByGenreId.set(entry.id, entry.trackIds);

		for (const trackId of entry.trackIds) {
			const existing = genreIdsByTrackId.get(trackId);
			if (existing) {
				existing.push(entry.id);
			} else {
				genreIdsByTrackId.set(trackId, [entry.id]);
			}
		}
	}

	return { genreIdsByTrackId, trackIdsByGenreId };
}

export function buildInstantMix(
	seed: InstantMixSeed,
	library: InstantMixLibrary,
	options: InstantMixOptions = {},
): Array<Track> {
	const context: MixContext = {
		index: buildGenreIndex(library.genres),
		library,
		random: options.random ?? Math.random,
		tracksById: new Map(library.tracks.map((track) => [track.id, track])),
	};

	const limit = Math.max(1, options.limit ?? INSTANT_MIX_LIMIT);
	const lead = leadTrack(seed, context);
	const related = relatedTracks(seed, context, lead, limit - (lead ? 1 : 0));

	return lead ? [lead, ...related] : related;
}

function albumSeedGenreIds(albumId: string, context: MixContext): Set<string> {
	const entry = context.library.albums.find((album) => album.id === albumId);
	const declared = new Set(entry?.genreIds ?? []);
	if (declared.size > 0) {
		return declared;
	}

	return genreIdsOfTracks(albumTrackIds(albumId, context), context);
}

function albumTrackIds(albumId: string, context: MixContext): Array<string> {
	const entry = context.library.albums.find((album) => album.id === albumId);
	if (entry && entry.trackIds.length > 0) {
		return entry.trackIds;
	}

	return context.library.tracks
		.filter((track) => track.albumId === albumId)
		.map((track) => track.id);
}

function artistTrackIds(artistId: string, context: MixContext): Array<string> {
	const trackIds = new Set(
		context.library.tracks.filter((track) => track.artistId === artistId).map((track) => track.id),
	);

	const entry = context.library.artists.find((artist) => artist.id === artistId);
	for (const albumId of entry?.albumIds ?? []) {
		for (const trackId of albumTrackIds(albumId, context)) {
			trackIds.add(trackId);
		}
	}

	return [...trackIds];
}

function genreIdsOfTracks(trackIds: Array<string>, context: MixContext): Set<string> {
	const genreIds = new Set<string>();
	for (const trackId of trackIds) {
		for (const genreId of context.index.genreIdsByTrackId.get(trackId) ?? []) {
			genreIds.add(genreId);
		}
	}
	return genreIds;
}

function groupKey(track: Track): string {
	return track.albumId || track.artistId || track.id;
}

function leadTrack(seed: InstantMixSeed, context: MixContext): Track | null {
	switch (seed.kind) {
		case 'album':
			return sampleTrack(albumTrackIds(seed.id, context), context);
		case 'artist':
			return sampleTrack(artistTrackIds(seed.id, context), context);
		case 'track':
			return context.tracksById.get(seed.id) ?? null;
		default:
			return null;
	}
}

function playlistTrackIds(playlistId: string, context: MixContext): Array<string> {
	return context.library.playlists.find((playlist) => playlist.id === playlistId)?.trackIds ?? [];
}

function relatedCandidates(
	seed: InstantMixSeed,
	context: MixContext,
	excludeTrackId: string | null,
): Array<Track> {
	const byGenre = tracksByGenreOverlap(seed, context, excludeTrackId);
	if (byGenre.length > 0) {
		return byGenre;
	}

	const artistId = seedArtistId(seed, context);
	if (artistId) {
		const byArtist = context.library.tracks.filter(
			(track) => track.artistId === artistId && track.id !== excludeTrackId,
		);
		if (byArtist.length > 0) {
			return shuffle(byArtist, context.random);
		}
	}

	const albumId = seedAlbumId(seed, context);
	if (albumId) {
		const byAlbum = context.library.tracks.filter(
			(track) => track.albumId === albumId && track.id !== excludeTrackId,
		);
		if (byAlbum.length > 0) {
			return shuffle(byAlbum, context.random);
		}
	}

	return shuffle(
		context.library.tracks.filter((track) => track.id !== excludeTrackId),
		context.random,
	);
}

function relatedTracks(
	seed: InstantMixSeed,
	context: MixContext,
	lead: Track | null,
	needed: number,
): Array<Track> {
	if (needed <= 0) {
		return [];
	}

	return spreadAcrossAlbums(
		relatedCandidates(seed, context, lead?.id ?? null),
		needed,
		lead ? groupKey(lead) : null,
	);
}

function seedAlbumId(seed: InstantMixSeed, context: MixContext): string | undefined {
	if (seed.kind === 'album') {
		return seed.id;
	}
	if (seed.kind === 'track') {
		return context.tracksById.get(seed.id)?.albumId;
	}
	return undefined;
}

function seedArtistId(seed: InstantMixSeed, context: MixContext): string | undefined {
	switch (seed.kind) {
		case 'album':
			return albumTrackIds(seed.id, context)
				.map((trackId) => context.tracksById.get(trackId)?.artistId)
				.find((artistId) => artistId != null);
		case 'artist':
			return seed.id;
		case 'track':
			return context.tracksById.get(seed.id)?.artistId;
		default:
			return undefined;
	}
}

function seedGenreIds(seed: InstantMixSeed, context: MixContext): Set<string> {
	switch (seed.kind) {
		case 'album':
			return albumSeedGenreIds(seed.id, context);
		case 'artist':
			return genreIdsOfTracks(artistTrackIds(seed.id, context), context);
		case 'genre':
			return new Set([seed.id]);
		case 'playlist':
			return genreIdsOfTracks(playlistTrackIds(seed.id, context), context);
		case 'track':
			return trackSeedGenreIds(seed.id, context);
	}
}

function sample<T>(items: Array<T>, count: number, random: () => number): Array<T> {
	const wanted = Math.min(count, items.length);
	if (wanted <= 0) {
		return [];
	}

	const copy = [...items];
	for (let i = 0; i < wanted; i++) {
		const swapIndex = i + Math.floor(random() * (copy.length - i));
		[copy[i], copy[swapIndex]] = [copy[swapIndex], copy[i]];
	}
	return copy.slice(0, wanted);
}

function shuffle<T>(items: Array<T>, random: () => number): Array<T> {
	return sample(items, items.length, random);
}

function sampleTrack(trackIds: Array<string>, context: MixContext): Track | null {
	const candidates: Array<Track> = [];
	for (const trackId of trackIds) {
		const track = context.tracksById.get(trackId);
		if (track) {
			candidates.push(track);
		}
	}

	return sample(candidates, 1, context.random)[0] ?? null;
}

function spreadAcrossAlbums(
	candidates: Array<Track>,
	needed: number,
	leadKey: string | null,
): Array<Track> {
	const queuesByKey = new Map<string, Array<Track>>();
	for (const track of candidates) {
		const key = groupKey(track);
		const queue = queuesByKey.get(key);
		if (queue) {
			queue.push(track);
		} else {
			queuesByKey.set(key, [track]);
		}
	}

	const rotation: Array<Array<Track>> = [];
	for (const [key, queue] of queuesByKey) {
		if (key !== leadKey) {
			rotation.push(queue);
		}
	}

	const leadQueue = leadKey === null ? undefined : queuesByKey.get(leadKey);
	if (leadQueue) {
		rotation.push(leadQueue);
	}

	const picked: Array<Track> = [];
	for (let position = 0; picked.length < needed; position++) {
		const pickedBefore = picked.length;

		for (const queue of rotation) {
			const track = queue[position];
			if (track) {
				picked.push(track);
			}
			if (picked.length >= needed) {
				break;
			}
		}

		if (picked.length === pickedBefore) {
			break;
		}
	}

	return picked;
}

function trackSeedGenreIds(trackId: string, context: MixContext): Set<string> {
	const indexed = context.index.genreIdsByTrackId.get(trackId);
	if (indexed && indexed.length > 0) {
		return new Set(indexed);
	}

	const track = context.tracksById.get(trackId);
	if (track?.albumId) {
		const albumGenreIds = albumSeedGenreIds(track.albumId, context);
		if (albumGenreIds.size > 0) {
			return albumGenreIds;
		}
	}

	if (track?.artistId) {
		return genreIdsOfTracks(artistTrackIds(track.artistId, context), context);
	}

	return new Set();
}

function tracksByGenreOverlap(
	seed: InstantMixSeed,
	context: MixContext,
	excludeTrackId: string | null,
): Array<Track> {
	const genreIds = seedGenreIds(seed, context);
	if (genreIds.size === 0) {
		return [];
	}

	const overlapByTrackId = new Map<string, number>();
	for (const genreId of genreIds) {
		for (const trackId of context.index.trackIdsByGenreId.get(genreId) ?? []) {
			if (trackId === excludeTrackId || !context.tracksById.has(trackId)) {
				continue;
			}
			overlapByTrackId.set(trackId, (overlapByTrackId.get(trackId) ?? 0) + 1);
		}
	}

	const bands = new Map<number, Array<Track>>();
	for (const [trackId, overlap] of overlapByTrackId) {
		const track = context.tracksById.get(trackId);
		if (!track) {
			continue;
		}

		const band = bands.get(overlap);
		if (band) {
			band.push(track);
		} else {
			bands.set(overlap, [track]);
		}
	}

	const ranked: Array<Track> = [];
	for (const overlap of [...bands.keys()].sort((left, right) => right - left)) {
		ranked.push(...shuffle(bands.get(overlap) ?? [], context.random));
	}

	return ranked;
}
