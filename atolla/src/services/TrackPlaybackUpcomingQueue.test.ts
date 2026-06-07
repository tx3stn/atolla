import { describe, expect, it } from 'bun:test';
import type { Track } from '../models/Track';
import { PlaybackStore } from '../stores/Playback';
import { buildUpcomingQueueEntries, UPCOMING_QUEUE_WINDOW } from './TrackPlaybackUpcomingQueue';

function makeTrack(id: string, overrides: Partial<Track> = {}): Track {
	return {
		albumName: `${id}-album`,
		artistName: `${id}-artist`,
		duration: 120,
		id,
		name: `${id}-name`,
		...overrides,
	};
}

function makeStore(trackIds: Array<string>, startIndex = 0): PlaybackStore {
	const store = new PlaybackStore();
	store.playTracks(
		trackIds.map((id) => makeTrack(id)),
		startIndex,
	);
	return store;
}

const resolveAll = (trackId: string): string | null => `file:///cache/${trackId}.mp3`;

describe('buildUpcomingQueueEntries', () => {
	it('returns the tracks after the current one in order', () => {
		const store = makeStore(['a', 'b', 'c', 'd'], 1);

		const entries = buildUpcomingQueueEntries(store, resolveAll);

		expect(entries.map((entry) => entry.trackId)).toEqual(['c', 'd']);
		expect(entries[0]?.sourceUrl).toBe('file:///cache/c.mp3');
	});

	it('carries track metadata for the native notification', () => {
		const store = makeStore(['a', 'b']);

		const [entry] = buildUpcomingQueueEntries(store, resolveAll);

		expect(entry).toMatchObject({
			albumName: 'b-album',
			artistName: 'b-artist',
			durationMs: 120_000,
			durationSeconds: 120,
			hasNext: false,
			hasPrevious: true,
			trackId: 'b',
			trackName: 'b-name',
		});
	});

	it('returns nothing on the last track without looping', () => {
		const store = makeStore(['a', 'b'], 1);

		expect(buildUpcomingQueueEntries(store, resolveAll)).toEqual([]);
	});

	it('wraps around under queue loop', () => {
		const store = makeStore(['a', 'b', 'c'], 2);
		store.cycleLoopMode();
		expect(store.loopMode).toBe('queue');

		const entries = buildUpcomingQueueEntries(store, resolveAll);

		expect(entries.slice(0, 3).map((entry) => entry.trackId)).toEqual(['a', 'b', 'c']);
		expect(entries.length).toBe(UPCOMING_QUEUE_WINDOW);
	});

	it('repeats the current track under track loop', () => {
		const store = makeStore(['a', 'b'], 0);
		store.cycleLoopMode();
		store.cycleLoopMode();
		expect(store.loopMode).toBe('track');

		const entries = buildUpcomingQueueEntries(store, resolveAll);

		expect(entries.length).toBe(UPCOMING_QUEUE_WINDOW);
		expect(entries.every((entry) => entry.trackId === 'a')).toBe(true);
	});

	it('stops at the first track without a resolvable source', () => {
		const store = makeStore(['a', 'b', 'c', 'd']);
		const resolveOnlyB = (trackId: string) =>
			trackId === 'b' ? `file:///cache/${trackId}.mp3` : null;

		const entries = buildUpcomingQueueEntries(store, resolveOnlyB);

		expect(entries.map((entry) => entry.trackId)).toEqual(['b']);
	});

	it('caps the window for long queues', () => {
		const ids = Array.from({ length: 30 }, (_, index) => `track-${index}`);
		const store = makeStore(ids, 0);

		const entries = buildUpcomingQueueEntries(store, resolveAll);

		expect(entries.length).toBe(UPCOMING_QUEUE_WINDOW);
		expect(entries[0]?.trackId).toBe('track-1');
	});

	it('returns nothing for an empty queue', () => {
		const store = new PlaybackStore();

		expect(buildUpcomingQueueEntries(store, resolveAll)).toEqual([]);
	});
});
