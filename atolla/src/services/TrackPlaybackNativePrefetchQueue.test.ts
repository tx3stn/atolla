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
			(trackId, _url, onComplete) => {
				attemptedTrackIds.push(trackId);
				cached.add(trackId);
				onComplete(`file:///tmp/${trackId}.mp3`);
			},
		);

		queue.replaceQueue([createTrack('a'), createTrack('b'), createTrack('c')], 1);
		await waitFor(() => attemptedTrackIds.length === 2);

		expect(attemptedTrackIds).toEqual(['b', 'c']);
	});

	it('limits prefetch depth to maxCount from the start index', async () => {
		const attemptedTrackIds: Array<string> = [];
		const cached = new Set<string>();

		const queue = new TrackPlaybackNativePrefetchQueue(
			(track) => `https://audio/${track.id}`,
			(trackId) => cached.has(trackId),
			(trackId, _url, onComplete) => {
				attemptedTrackIds.push(trackId);
				cached.add(trackId);
				onComplete(`file:///tmp/${trackId}.mp3`);
			},
		);

		queue.replaceQueue(
			[createTrack('a'), createTrack('b'), createTrack('c'), createTrack('d')],
			1,
			2,
		);
		await waitFor(() => attemptedTrackIds.length === 2);
		await new Promise((resolve) => setTimeout(resolve, 20));

		expect(attemptedTrackIds).toEqual(['b', 'c']);
	});

	it('replaces pending queue when new queue is provided', async () => {
		const attemptedTrackIds: Array<string> = [];
		const cached = new Set<string>();

		const queue = new TrackPlaybackNativePrefetchQueue(
			(track) => `https://audio/${track.id}`,
			(trackId) => cached.has(trackId),
			(trackId, _url, onComplete) => {
				attemptedTrackIds.push(trackId);
				cached.add(trackId);
				onComplete(`file:///tmp/${trackId}.mp3`);
			},
		);

		queue.replaceQueue([createTrack('a'), createTrack('b')], 0);
		queue.replaceQueue([createTrack('x'), createTrack('y')], 0);
		await waitFor(() => attemptedTrackIds.includes('x') && attemptedTrackIds.includes('y'));

		expect(attemptedTrackIds.includes('b')).toBe(false);
		expect(attemptedTrackIds.slice(-2)).toEqual(['x', 'y']);
	});

	it('unblocks after replaceQueue when a prior cacheTrack callback never fires', async () => {
		const attemptedTrackIds: Array<string> = [];
		const cached = new Set<string>();

		const queue = new TrackPlaybackNativePrefetchQueue(
			(track) => `https://audio/${track.id}`,
			(trackId) => cached.has(trackId),
			(trackId, _url, onComplete) => {
				attemptedTrackIds.push(trackId);
				// never call onComplete for the first track: simulates a hung native op
				if (trackId !== 'hung') {
					cached.add(trackId);
					onComplete(`file:///tmp/${trackId}.mp3`);
				}
			},
		);

		// 'hung' will stall inProgress indefinitely
		queue.replaceQueue([createTrack('hung')], 0);
		await waitFor(() => attemptedTrackIds.includes('hung'));

		// replace queue while inProgress is stuck
		queue.replaceQueue([createTrack('x'), createTrack('y')], 0);
		await waitFor(() => attemptedTrackIds.includes('x') && attemptedTrackIds.includes('y'));

		expect(attemptedTrackIds.filter((id) => id !== 'hung')).toEqual(['x', 'y']);
	});

	it('skips tracks that are already cached', async () => {
		const attemptedTrackIds: Array<string> = [];
		const cached = new Set<string>(['b']);

		const queue = new TrackPlaybackNativePrefetchQueue(
			(track) => `https://audio/${track.id}`,
			(trackId) => cached.has(trackId),
			(trackId, _url, onComplete) => {
				attemptedTrackIds.push(trackId);
				cached.add(trackId);
				onComplete(`file:///tmp/${trackId}.mp3`);
			},
		);

		queue.replaceQueue([createTrack('a'), createTrack('b'), createTrack('c')], 1);
		await waitFor(() => attemptedTrackIds.length === 1);

		expect(attemptedTrackIds).toEqual(['c']);
	});

	it('does not call onTrackStored for a stale generation when cacheTrack fires late', async () => {
		const storedTrackIds: Array<string> = [];
		const cached = new Set<string>();
		let pendingCallback: ((source: string | null) => void) | null = null;

		const queue = new TrackPlaybackNativePrefetchQueue(
			(track) => `https://audio/${track.id}`,
			(trackId) => cached.has(trackId),
			(trackId, _url, onComplete) => {
				if (trackId === 'stale') {
					// hold the callback; simulates a slow native op that completes late
					pendingCallback = onComplete;
				} else {
					cached.add(trackId);
					onComplete(`file:///tmp/${trackId}.mp3`);
				}
			},
			(trackId) => storedTrackIds.push(trackId),
		);

		// start 'stale'; its cacheTrack callback is held
		queue.replaceQueue([createTrack('stale')], 0);
		await waitFor(() => pendingCallback !== null);

		// replace the queue while 'stale' is in flight
		queue.replaceQueue([createTrack('x'), createTrack('y')], 0);
		await waitFor(() => storedTrackIds.includes('x') && storedTrackIds.includes('y'));

		// fire the stale callback; should be a no-op for the new generation
		// biome-ignore lint/style/noNonNullAssertion: set above
		pendingCallback!('file:///tmp/stale.mp3');

		// give any unintended side-effects a chance to settle
		await new Promise((resolve) => setTimeout(resolve, 20));

		expect(storedTrackIds).not.toContain('stale');
		expect(storedTrackIds).toEqual(['x', 'y']);
	});
});
