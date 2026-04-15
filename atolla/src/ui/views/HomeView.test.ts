import { describe, expect, it } from 'bun:test';
import type { Album } from '../../models/Album';
import { ConnectionModes } from '../../transports/Model';
import {
	createHomeAlbumsSignature,
	parseHomeAlbumsCache,
	serializeHomeAlbumsCache,
} from './HomeAlbumsCache';
import { shouldApplyTransportAlbumsToHome } from './HomeView';

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
});
