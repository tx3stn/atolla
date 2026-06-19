import { describe, expect, it } from 'bun:test';
import type { Track } from '../../models/Track';
import { groupTracksByDisc } from './albumDiscGrouping';

function track(id: string, discNumber?: number, trackNumber?: number): Track {
	return { duration: 60, id, name: id, trackNumber, ...(discNumber != null ? { discNumber } : {}) };
}

describe('groupTracksByDisc', () => {
	it('returns a single undisced group when no track has a disc number', () => {
		const tracks = [track('a'), track('b')];
		const { groups, multiDisc } = groupTracksByDisc(tracks);

		expect(multiDisc).toBe(false);
		expect(groups).toHaveLength(1);
		expect(groups[0].disc).toBeNull();
		expect(groups[0].tracks.map((t) => t.id)).toEqual(['a', 'b']);
	});

	it('does not treat a single disc number as multi-disc', () => {
		const tracks = [track('a', 1), track('b', 1)];
		const { groups, multiDisc } = groupTracksByDisc(tracks);

		expect(multiDisc).toBe(false);
		expect(groups).toHaveLength(1);
		expect(groups[0].disc).toBe(1);
	});

	it('splits more than one disc number into ordered sections', () => {
		const tracks = [track('a', 1, 1), track('b', 1, 2), track('c', 2, 1)];
		const { groups, multiDisc } = groupTracksByDisc(tracks);

		expect(multiDisc).toBe(true);
		expect(groups.map((g) => g.disc)).toEqual([1, 2]);
		expect(groups[0].tracks.map((t) => t.id)).toEqual(['a', 'b']);
		expect(groups[1].tracks.map((t) => t.id)).toEqual(['c']);
	});

	it('groups interleaved input back into contiguous disc sections', () => {
		const tracks = [track('a1', 1, 1), track('b1', 2, 1), track('a2', 1, 2), track('b2', 2, 2)];
		const { groups } = groupTracksByDisc(tracks);

		expect(groups.map((g) => g.disc)).toEqual([1, 2]);
		expect(groups[0].tracks.map((t) => t.id)).toEqual(['a1', 'a2']);
		expect(groups[1].tracks.map((t) => t.id)).toEqual(['b1', 'b2']);
	});

	it('orders discs ascending even with gaps in numbering', () => {
		const tracks = [track('c', 3), track('a', 1)];
		const { groups, multiDisc } = groupTracksByDisc(tracks);

		expect(multiDisc).toBe(true);
		expect(groups.map((g) => g.disc)).toEqual([1, 3]);
	});

	it('places an undisced group last and ignores it for the multi-disc decision', () => {
		const tracks = [track('plain'), track('disc-one', 1)];
		const { groups, multiDisc } = groupTracksByDisc(tracks);

		expect(multiDisc).toBe(false);
		expect(groups.map((g) => g.disc)).toEqual([1, null]);
	});
});
