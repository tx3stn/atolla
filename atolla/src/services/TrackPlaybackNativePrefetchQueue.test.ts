import { describe, expect, it } from 'bun:test';
import type { Track } from '../models/Track';
import { TrackPlaybackNativePrefetchQueue } from './TrackPlaybackNativePrefetchQueue';

function createTrack(id: string): Track {
	return {
		duration: 180,
		id,
		name: `Track ${id}`,
	};
}

async function waitFor(predicate: () => boolean, timeoutMs = 250): Promise<void> {
	const started = Date.now();
	while (!predicate()) {
		if (Date.now() - started > timeoutMs) {
			throw new Error('condition not met before timeout');
		}
		await new Promise((resolve) => setTimeout(resolve, 5));
	}
}

describe('TrackPlaybackNativePrefetchQueue', () => {
	it('prefetches remaining tracks in queue order from start index', async () => {
		const attemptedTrackIds: Array<string> = [];
		const cached = new Set<string>();

		const queue = new TrackPlaybackNativePrefetchQueue(
			(track) => `https://audio/${track.id}`,
			(trackId) => cached.has(trackId),
			(trackId) => {
				attemptedTrackIds.push(trackId);
				cached.add(trackId);
				return `file:///tmp/${trackId}.mp3`;
			},
		);

		queue.replaceQueue([createTrack('a'), createTrack('b'), createTrack('c')], 1);
		await waitFor(() => attemptedTrackIds.length === 2);

		expect(attemptedTrackIds).toEqual(['b', 'c']);
	});

	it('replaces pending queue when new queue is provided', async () => {
		const attemptedTrackIds: Array<string> = [];
		const cached = new Set<string>();

		const queue = new TrackPlaybackNativePrefetchQueue(
			(track) => `https://audio/${track.id}`,
			(trackId) => cached.has(trackId),
			(trackId) => {
				attemptedTrackIds.push(trackId);
				cached.add(trackId);
				return `file:///tmp/${trackId}.mp3`;
			},
		);

		queue.replaceQueue([createTrack('a'), createTrack('b')], 0);
		queue.replaceQueue([createTrack('x'), createTrack('y')], 0);
		await waitFor(() => attemptedTrackIds.includes('x') && attemptedTrackIds.includes('y'));

		expect(attemptedTrackIds.includes('b')).toBe(false);
		expect(attemptedTrackIds.slice(-2)).toEqual(['x', 'y']);
	});

	it('skips tracks that are already cached', async () => {
		const attemptedTrackIds: Array<string> = [];
		const cached = new Set<string>(['b']);

		const queue = new TrackPlaybackNativePrefetchQueue(
			(track) => `https://audio/${track.id}`,
			(trackId) => cached.has(trackId),
			(trackId) => {
				attemptedTrackIds.push(trackId);
				cached.add(trackId);
				return `file:///tmp/${trackId}.mp3`;
			},
		);

		queue.replaceQueue([createTrack('a'), createTrack('b'), createTrack('c')], 1);
		await waitFor(() => attemptedTrackIds.length === 1);

		expect(attemptedTrackIds).toEqual(['c']);
	});
});
