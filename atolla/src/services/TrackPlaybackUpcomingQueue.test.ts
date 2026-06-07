import { describe, expect, it } from 'bun:test';
import type { Track } from '../models/Track';
import { PlaybackStore } from '../stores/Playback';
import {
	buildPlaybackQueueWindow,
	QUEUE_WINDOW_FORWARD,
	QUEUE_WINDOW_HISTORY,
} from './TrackPlaybackUpcomingQueue';

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

describe('buildPlaybackQueueWindow', () => {
	it('centres the window on the current track with history and upcoming', () => {
		const window = buildPlaybackQueueWindow(makeStore(['a', 'b', 'c', 'd'], 2), resolveAll);

		expect(window.entries.map((entry) => entry.trackId)).toEqual(['a', 'b', 'c', 'd']);
		expect(window.currentIndex).toBe(2);
		expect(window.entries[window.currentIndex]?.trackId).toBe('c');
	});

	it('carries track metadata for the native notification', () => {
		const window = buildPlaybackQueueWindow(makeStore(['a', 'b']), resolveAll);

		expect(window.entries[1]).toMatchObject({
			albumName: 'b-album',
			artistName: 'b-artist',
			durationMs: 120_000,
			durationSeconds: 120,
			hasNext: false,
			hasPrevious: true,
			sourceUrl: 'file:///cache/b.mp3',
			trackId: 'b',
			trackName: 'b-name',
		});
	});

	it('has only the current entry on a single-track queue without looping', () => {
		const window = buildPlaybackQueueWindow(makeStore(['a']), resolveAll);

		expect(window.entries.map((entry) => entry.trackId)).toEqual(['a']);
		expect(window.currentIndex).toBe(0);
	});

	it('wraps both directions under queue loop', () => {
		const store = makeStore(['a', 'b', 'c'], 0);
		store.cycleLoopMode();
		expect(store.loopMode).toBe('queue');

		const window = buildPlaybackQueueWindow(store, resolveAll);

		expect(window.entries.length).toBe(QUEUE_WINDOW_HISTORY + 1 + QUEUE_WINDOW_FORWARD);
		expect(window.currentIndex).toBe(QUEUE_WINDOW_HISTORY);
		expect(window.entries[window.currentIndex]?.trackId).toBe('a');
		// History wraps backwards: ..., b, c immediately before the current a.
		expect(window.entries[window.currentIndex - 1]?.trackId).toBe('c');
		expect(window.entries[window.currentIndex + 1]?.trackId).toBe('b');
	});

	it('repeats the current track under track loop', () => {
		const store = makeStore(['a', 'b'], 0);
		store.cycleLoopMode();
		store.cycleLoopMode();
		expect(store.loopMode).toBe('track');

		const window = buildPlaybackQueueWindow(store, resolveAll);

		expect(window.entries.every((entry) => entry.trackId === 'a')).toBe(true);
		expect(window.entries.length).toBe(QUEUE_WINDOW_HISTORY + 1 + QUEUE_WINDOW_FORWARD);
		expect(window.currentIndex).toBe(QUEUE_WINDOW_HISTORY);
	});

	it('truncates the forward window at the first unresolvable source', () => {
		const store = makeStore(['a', 'b', 'c', 'd']);
		const resolveSome = (trackId: string) =>
			trackId === 'c' || trackId === 'd' ? null : `file:///cache/${trackId}.mp3`;

		const window = buildPlaybackQueueWindow(store, resolveSome);

		expect(window.entries.map((entry) => entry.trackId)).toEqual(['a', 'b']);
		expect(window.currentIndex).toBe(0);
	});

	it('truncates the history window at the first unresolvable source walking backwards', () => {
		const store = makeStore(['a', 'b', 'c', 'd'], 3);
		const resolveSome = (trackId: string) =>
			trackId === 'a' ? null : `file:///cache/${trackId}.mp3`;

		const window = buildPlaybackQueueWindow(store, resolveSome);

		expect(window.entries.map((entry) => entry.trackId)).toEqual(['b', 'c', 'd']);
		expect(window.currentIndex).toBe(2);
	});

	it('includes the current entry even when its source is unresolvable', () => {
		const store = makeStore(['a', 'b']);
		const resolveNone = () => null;

		const window = buildPlaybackQueueWindow(store, resolveNone);

		expect(window.entries.map((entry) => entry.trackId)).toEqual(['a']);
		expect(window.entries[0]?.sourceUrl).toBe('');
		expect(window.currentIndex).toBe(0);
	});

	it('caps both directions for long queues', () => {
		const ids = Array.from({ length: 100 }, (_, index) => `track-${index}`);
		const window = buildPlaybackQueueWindow(makeStore(ids, 50), resolveAll);

		expect(window.entries.length).toBe(QUEUE_WINDOW_HISTORY + 1 + QUEUE_WINDOW_FORWARD);
		expect(window.currentIndex).toBe(QUEUE_WINDOW_HISTORY);
		expect(window.entries[0]?.trackId).toBe(`track-${50 - QUEUE_WINDOW_HISTORY}`);
		expect(window.entries[window.entries.length - 1]?.trackId).toBe(
			`track-${50 + QUEUE_WINDOW_FORWARD}`,
		);
	});

	it('returns an empty window for an empty queue', () => {
		const window = buildPlaybackQueueWindow(new PlaybackStore(), resolveAll);

		expect(window.entries).toEqual([]);
		expect(window.currentIndex).toBe(0);
	});
});
