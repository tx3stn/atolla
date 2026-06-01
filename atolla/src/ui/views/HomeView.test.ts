import { describe, expect, it } from 'bun:test';
import type { Album } from '../../models/Album';
import type { Track } from '../../models/Track';
import { ConnectionModes } from '../../transports/Model';
import {
	createHomeAlbumsSignature,
	parseHomeAlbumsCache,
	serializeHomeAlbumsCache,
} from './HomeAlbumsCache';
import {
	buildShuffleLibraryQueue,
	getRandomAlbumTracks,
	resolveArtistLogoUrlsForTracks,
	shouldApplyTransportAlbumsToHome,
} from './HomeViewLogic';

const sampleAlbums: Array<Album> = [
	{
		artistId: 'artist-1',
		artistName: 'Artist One',
		id: 'album-1',
		imageUrl: 'https://example.com/album-1.jpg',
		name: 'Album One',
		releaseDate: '2001-01-01',
	},
	{
		artistId: 'artist-2',
		artistName: 'Artist Two',
		id: 'album-2',
		name: 'Album Two',
	},
];

describe('HomeView cache helpers', () => {
	it('serializes and parses cache payloads', () => {
		const serialized = serializeHomeAlbumsCache(sampleAlbums);
		expect(parseHomeAlbumsCache(serialized)).toEqual(sampleAlbums);
	});

	it('parses legacy array payloads', () => {
		const legacyPayload = JSON.stringify(sampleAlbums);
		expect(parseHomeAlbumsCache(legacyPayload)).toEqual(sampleAlbums);
	});

	it('returns null for invalid payloads', () => {
		expect(parseHomeAlbumsCache('not-json')).toBeNull();
		expect(parseHomeAlbumsCache(JSON.stringify({ albums: [{ id: 'bad' }] }))).toBeNull();
		expect(parseHomeAlbumsCache(JSON.stringify({ invalid: true }))).toBeNull();
	});

	it('creates stable signatures for matching payloads', () => {
		expect(createHomeAlbumsSignature(sampleAlbums)).toBe(
			createHomeAlbumsSignature(parseHomeAlbumsCache(serializeHomeAlbumsCache(sampleAlbums)) ?? []),
		);
	});

	it('creates different signatures when album data changes', () => {
		const changed = sampleAlbums.map((album) => ({ ...album }));
		changed[0] = { ...changed[0], name: 'Album One (Deluxe)' };

		expect(createHomeAlbumsSignature(changed)).not.toBe(createHomeAlbumsSignature(sampleAlbums));
	});

	it('preserves album genres through cache serialization', () => {
		const withGenres: Array<Album> = [
			{
				...sampleAlbums[0],
				genres: [
					{ id: 'genre-2', name: 'Noise Rock' },
					{ id: 'genre-1', name: 'Post-Hardcore' },
				],
			},
		];

		expect(parseHomeAlbumsCache(serializeHomeAlbumsCache(withGenres))).toEqual(withGenres);
	});

	it('keeps cached home albums when offline mode is active', () => {
		expect(shouldApplyTransportAlbumsToHome(ConnectionModes.offline)).toBe(false);
		expect(shouldApplyTransportAlbumsToHome(ConnectionModes.online)).toBe(true);
		expect(shouldApplyTransportAlbumsToHome(ConnectionModes.mock)).toBe(true);
	});

	it('resolves artist logo urls per track and reuses duplicate artist requests', async () => {
		const calls: Array<string> = [];
		const tracks: Array<Track> = [
			{ artistId: 'artist-1', duration: 120, id: 'track-1', name: 'Track One' },
			{ artistId: 'artist-2', duration: 120, id: 'track-2', name: 'Track Two' },
			{ artistId: 'artist-1', duration: 120, id: 'track-3', name: 'Track Three' },
			{ duration: 120, id: 'track-4', name: 'Track Four' },
		];

		const logoUrls = await resolveArtistLogoUrlsForTracks(tracks, {
			getArtistLogoUrl: (artistId: string): Promise<string | null> => {
				calls.push(artistId);
				return Promise.resolve(`${artistId}-logo`);
			},
		});

		expect(calls).toEqual(['artist-1', 'artist-2']);
		expect(logoUrls).toEqual(['artist-1-logo', 'artist-2-logo', 'artist-1-logo', null]);
	});

	it('falls back to null logos when transport lookup fails', async () => {
		const tracks: Array<Track> = [
			{ artistId: 'artist-1', duration: 120, id: 'track-1', name: 'Track One' },
			{ artistId: 'artist-2', duration: 120, id: 'track-2', name: 'Track Two' },
		];

		const logoUrls = await resolveArtistLogoUrlsForTracks(tracks, {
			getArtistLogoUrl: (artistId: string): Promise<string | null> => {
				if (artistId === 'artist-1') {
					return Promise.reject(new Error('network failure'));
				}
				return Promise.resolve('artist-2-logo');
			},
		});

		expect(logoUrls).toEqual([null, 'artist-2-logo']);
	});

	it('returns tracks from the transport shuffled library endpoint', async () => {
		const remoteTracks: Array<Track> = [
			{ duration: 120, id: 'track-2', name: 'Track Two' },
			{ duration: 120, id: 'track-1', name: 'Track One' },
		];

		const queue = await buildShuffleLibraryQueue({
			getShuffledLibraryTracks: async () => remoteTracks,
		});

		expect(queue).toEqual(remoteTracks);
	});

	it('returns an empty queue when the shuffled library endpoint rejects', async () => {
		const queue = await buildShuffleLibraryQueue({
			getShuffledLibraryTracks: () => Promise.reject(new Error('network failure')),
		});

		expect(queue).toEqual([]);
	});
});

describe('getRandomAlbumTracks', () => {
	it('returns the tracks of the album chosen by getRandomAlbum', async () => {
		const tracks: Array<Track> = [
			{ duration: 180, id: 'track-1', name: 'Track One' },
			{ duration: 200, id: 'track-2', name: 'Track Two' },
		];

		const result = await getRandomAlbumTracks({
			getRandomAlbum: async () => ({
				artistId: 'artist-1',
				artistName: 'Artist One',
				id: 'album-1',
				name: 'Album One',
			}),
			getTracksByAlbum: async () => tracks,
		});

		expect(result).toEqual(tracks);
	});

	it('returns an empty array without fetching tracks when getRandomAlbum returns null', async () => {
		let calledGetTracks = false;

		const result = await getRandomAlbumTracks({
			getRandomAlbum: () => Promise.resolve(null),
			getTracksByAlbum: () => {
				calledGetTracks = true;
				return Promise.resolve([]);
			},
		});

		expect(result).toEqual([]);
		expect(calledGetTracks).toBe(false);
	});

	it('returns an empty array when getRandomAlbum rejects', async () => {
		const result = await getRandomAlbumTracks({
			getRandomAlbum: () => Promise.reject(new Error('network failure')),
			getTracksByAlbum: async () => [{ duration: 120, id: 'track-1', name: 'Track One' }],
		});

		expect(result).toEqual([]);
	});
});
