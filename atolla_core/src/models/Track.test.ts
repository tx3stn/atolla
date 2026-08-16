import { describe, expect, it } from 'bun:test';
import { sanitizeTracks, trackReleaseYear } from './Track';

const baseTrack = {
	duration: 180,
	id: 'abc123',
	name: 'My Track',
};

describe('sanitizeTracks', () => {
	it('returns the same array reference when all tracks are already valid', () => {
		const tracks = [baseTrack, { ...baseTrack, id: 'def456', name: 'Another Track' }];
		expect(sanitizeTracks(tracks)).toBe(tracks);
	});

	it('returns a new array when a track has an empty name', () => {
		const bad = { ...baseTrack, name: '' };
		const result = sanitizeTracks([bad]);
		expect(result).not.toBe([bad]);
		expect(result[0]?.name).toBe('Unknown');
	});

	it('normalises NaN duration to 0', () => {
		const bad = { ...baseTrack, duration: Number.NaN };
		const result = sanitizeTracks([bad]);
		expect(result[0]?.duration).toBe(0);
	});

	it('normalises negative duration to 0', () => {
		const bad = { ...baseTrack, duration: -10 };
		const result = sanitizeTracks([bad]);
		expect(result[0]?.duration).toBe(0);
	});

	it('preserves zero duration', () => {
		const track = { ...baseTrack, duration: 0 };
		expect(sanitizeTracks([track])[0]?.duration).toBe(0);
	});

	it('preserves a valid track object reference in a mixed array', () => {
		const good = { ...baseTrack };
		const bad = { ...baseTrack, id: 'bad', name: '' };
		const result = sanitizeTracks([good, bad]);
		expect(result[0]).toBe(good);
		expect(result[1]?.name).toBe('Unknown');
	});

	it('preserves undefined optional fields', () => {
		const result = sanitizeTracks([{ ...baseTrack }]);
		expect(result[0]?.albumImageUrl).toBeUndefined();
		expect(result[0]?.artistName).toBeUndefined();
	});
});

describe('trackReleaseYear', () => {
	it('prefers the explicit production year', () => {
		expect(trackReleaseYear({ ...baseTrack, productionYear: 1999 })).toBe(1999);
	});

	it('falls back to the leading year of the release date', () => {
		expect(trackReleaseYear({ ...baseTrack, releaseDate: '2003-07-14T00:00:00Z' })).toBe(2003);
	});

	it('returns null when neither production year nor release date is present', () => {
		expect(trackReleaseYear(baseTrack)).toBeNull();
	});

	it('returns null when the release date has no parseable year', () => {
		expect(trackReleaseYear({ ...baseTrack, releaseDate: 'unknown' })).toBeNull();
	});
});
