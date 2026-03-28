import { describe, expect, it } from 'bun:test';
import type { JellyfinTrackItem } from '../models/jellyfin/Types';
import { mapJellyfinTrackToTrack } from './Live';

describe('mapJellyfinTrackToTrack', () => {
	it('maps release metadata from track item', () => {
		const item: JellyfinTrackItem = {
			Album: 'The Album',
			AlbumId: 'album-1',
			Id: 'track-1',
			Name: 'The Track',
			PremiereDate: '2020-04-20T00:00:00.0000000Z',
			ProductionYear: 2020,
			RunTimeTicks: 180_000_0000,
			Type: 'Audio',
		};

		const track = mapJellyfinTrackToTrack(item);

		expect(track.releaseDate).toBe('2020-04-20T00:00:00.0000000Z');
		expect(track.productionYear).toBe(2020);
	});
});
