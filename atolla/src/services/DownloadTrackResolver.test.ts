import { describe, expect, it } from 'bun:test';
import type { Artist } from '../models/Artist';
import type { Genre } from '../models/Genre';
import type { Track } from '../models/Track';
import {
	type DownloadTrackResolverTransport,
	resolveDownloadTracks,
} from './DownloadTrackResolver';

function makeTrack(id: string, overrides: Partial<Track> = {}): Track {
	return {
		albumId: 'album-1',
		artistId: 'artist-1',
		duration: 180,
		id,
		name: `Track ${id}`,
		...overrides,
	};
}

interface StubOptions {
	artists?: Record<string, Artist>;
	genrePages?: Record<number, { hasMore: boolean; items: Array<Genre> }>;
	logos?: Record<string, string | null>;
	noCacheUrlFor?: ReadonlyArray<string>;
	onGetArtistLogoUrl?: (artistId: string) => void;
	rejectLogoFor?: ReadonlyArray<string>;
}

function createTransport(options: StubOptions = {}): DownloadTrackResolverTransport {
	return {
		getArtist: (artistId) => Promise.resolve(options.artists?.[artistId] ?? null),
		getArtistLogoUrl: (artistId) => {
			options.onGetArtistLogoUrl?.(artistId);
			if (options.rejectLogoFor?.includes(artistId)) {
				return Promise.reject(new Error('logo failed'));
			}
			return Promise.resolve(options.logos?.[artistId] ?? null);
		},
		getGenres: (page) =>
			Promise.resolve(options.genrePages?.[page] ?? { hasMore: false, items: [] }),
		getTrackCacheUrl: (trackId) =>
			options.noCacheUrlFor?.includes(trackId) ? null : `http://s/${trackId}`,
	};
}

describe('resolveDownloadTracks', () => {
	it('builds stream urls and keeps existing logos without fetching', async () => {
		const calls: Array<string> = [];
		const transport = createTransport({ onGetArtistLogoUrl: (id) => calls.push(id) });

		const result = await resolveDownloadTracks(transport, [makeTrack('track-1')], {
			existingLogos: ['https://logo/existing.png'],
		});

		expect(result.tracks).toEqual([
			{
				artistLogoUrl: 'https://logo/existing.png',
				streamUrl: 'http://s/track-1',
				track: makeTrack('track-1'),
			},
		]);
		expect(calls).toEqual([]);
	});

	it('fetches missing logos when resolveMissingLogos is set', async () => {
		const calls: Array<string> = [];
		const transport = createTransport({
			logos: { 'artist-1': 'https://logo/artist-1.png' },
			onGetArtistLogoUrl: (id) => calls.push(id),
		});

		const result = await resolveDownloadTracks(transport, [makeTrack('track-1')], {
			resolveMissingLogos: true,
		});

		expect(result.tracks[0].artistLogoUrl).toBe('https://logo/artist-1.png');
		expect(calls).toEqual(['artist-1']);
	});

	it('does not fetch logos when resolveMissingLogos is false', async () => {
		const calls: Array<string> = [];
		const transport = createTransport({ onGetArtistLogoUrl: (id) => calls.push(id) });

		const result = await resolveDownloadTracks(transport, [makeTrack('track-1')]);

		expect(result.tracks[0].artistLogoUrl).toBeNull();
		expect(calls).toEqual([]);
	});

	it('drops tracks without a cache url', async () => {
		const transport = createTransport({ noCacheUrlFor: ['track-2'] });

		const result = await resolveDownloadTracks(transport, [
			makeTrack('track-1'),
			makeTrack('track-2'),
		]);

		expect(result.tracks.map((t) => t.track.id)).toEqual(['track-1']);
	});

	it('resolves unique artists and swallows artist lookup failures', async () => {
		const transport = createTransport({
			artists: { 'artist-1': { id: 'artist-1', name: 'Artist One' } },
		});

		const result = await resolveDownloadTracks(transport, [
			makeTrack('track-1', { artistId: 'artist-1' }),
			makeTrack('track-2', { artistId: 'artist-1' }),
			makeTrack('track-3', { artistId: 'artist-missing' }),
		]);

		expect(result.artists).toEqual([{ id: 'artist-1', name: 'Artist One' }]);
	});

	it('resolves genre image urls from the genre endpoint', async () => {
		const transport = createTransport({
			genrePages: {
				1: {
					hasMore: false,
					items: [{ id: 'genre-1', imageUrl: 'https://img/genre-1.jpg', name: 'Rock' }],
				},
			},
		});

		const result = await resolveDownloadTracks(transport, [
			makeTrack('track-1', { genres: [{ id: 'genre-1', name: 'Rock' }] }),
		]);

		expect(result.resolvedGenres.find((g) => g.id === 'genre-1')?.imageUrl).toBe(
			'https://img/genre-1.jpg',
		);
	});

	it('falls back to a null logo when the lookup rejects', async () => {
		const transport = createTransport({ rejectLogoFor: ['artist-1'] });

		const result = await resolveDownloadTracks(transport, [makeTrack('track-1')], {
			resolveMissingLogos: true,
		});

		expect(result.tracks[0].artistLogoUrl).toBeNull();
	});
});
