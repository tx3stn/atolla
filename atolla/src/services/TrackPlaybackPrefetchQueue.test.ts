import { describe, expect, it } from 'bun:test';
import type { Track } from '../models/Track';
import { TrackPlaybackPrefetchQueue } from './TrackPlaybackPrefetchQueue';

function createTrack(id: string): Track {
	return {
		duration: 180,
		id,
		name: `Track ${id}`,
	};
}

class FakeTrackCache {
	private existing = new Set<string>();
	stored: Array<string> = [];

	hasTrack(trackId: string): Promise<boolean> {
		return Promise.resolve(this.existing.has(trackId));
	}

	storeTrack(trackId: string, _value: ArrayBuffer, _mimeType?: string): Promise<void> {
		this.existing.add(trackId);
		this.stored.push(trackId);
		return Promise.resolve();
	}
}

async function waitFor(predicate: () => boolean, timeoutMs = 200): Promise<void> {
	const started = Date.now();
	while (!predicate()) {
		if (Date.now() - started > timeoutMs) {
			throw new Error('condition not met before timeout');
		}
		await new Promise((resolve) => setTimeout(resolve, 5));
	}
}

describe('TrackPlaybackPrefetchQueue', () => {
	it('prefetches current track first then remaining tracks in order', async () => {
		const fetchedUrls: Array<string> = [];
		const cache = new FakeTrackCache();
		const queue = new TrackPlaybackPrefetchQueue(
			cache,
			(track) => `https://audio/${track.id}`,
			(url) => {
				fetchedUrls.push(url);
				return Promise.resolve({ buffer: new Uint8Array([1]).buffer, mimeType: 'audio/mpeg' });
			},
		);

		queue.replaceQueue([createTrack('a'), createTrack('b'), createTrack('c')], 1);
		await waitFor(() => fetchedUrls.length === 2);

		expect(fetchedUrls).toEqual(['https://audio/b', 'https://audio/c']);
		expect(cache.stored).toEqual(['b', 'c']);
	});

	it('replaces existing queue when a new queue is provided', async () => {
		const cache = new FakeTrackCache();
		const queue = new TrackPlaybackPrefetchQueue(
			cache,
			(track) => `https://audio/${track.id}`,
			(url) => {
				if (url.endsWith('/a')) {
					return new Promise((resolve) =>
						setTimeout(
							() => resolve({ buffer: new Uint8Array([1]).buffer, mimeType: 'audio/mpeg' }),
							20,
						),
					);
				}
				return Promise.resolve({ buffer: new Uint8Array([1]).buffer, mimeType: 'audio/mpeg' });
			},
		);

		queue.replaceQueue([createTrack('a'), createTrack('b')], 0);
		queue.replaceQueue([createTrack('x'), createTrack('y')], 0);
		await waitFor(() => cache.stored.length === 2);

		expect(cache.stored).toEqual(['x', 'y']);
	});

	it('moves prioritized track to the front of pending queue', async () => {
		const fetchedUrls: Array<string> = [];
		const cache = new FakeTrackCache();
		const queue = new TrackPlaybackPrefetchQueue(
			cache,
			(track) => `https://audio/${track.id}`,
			(url) => {
				fetchedUrls.push(url);
				if (url.endsWith('/a')) {
					return new Promise((resolve) =>
						setTimeout(
							() => resolve({ buffer: new Uint8Array([1]).buffer, mimeType: 'audio/mpeg' }),
							10,
						),
					);
				}
				return Promise.resolve({ buffer: new Uint8Array([1]).buffer, mimeType: 'audio/mpeg' });
			},
		);

		queue.replaceQueue([createTrack('a'), createTrack('b'), createTrack('c')], 0);
		queue.prioritize(createTrack('c'));
		await new Promise((resolve) => setTimeout(resolve, 30));

		expect(fetchedUrls[0]).toBe('https://audio/a');
		expect(fetchedUrls[1]).toBe('https://audio/c');
	});
});
