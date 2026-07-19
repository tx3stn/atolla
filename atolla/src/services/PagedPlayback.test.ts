import { describe, expect, it } from 'bun:test';
import type { Track } from '../models/Track';
import { startPagedPlayback } from './PagedPlayback';
import type { TrackPage, TrackSource } from './TrackSource';

function makeTracks(start: number, count: number): Array<Track> {
	return Array.from({ length: count }, (_, index) => ({
		duration: 100,
		id: `track-${start + index}`,
		name: `Track ${start + index}`,
	}));
}

function makeStore() {
	const played: Array<Array<Track>> = [];
	const listeners: Array<() => void> = [];
	return {
		addToQueue(tracks: Array<Track>) {
			this.tracks = [...this.tracks, ...tracks];
			for (const listener of listeners) listener();
		},
		filler: null as { dispose(): void } | null,
		played,
		playTracks(tracks: Array<Track>, startIndex: number) {
			played.push(tracks);
			this.tracks = tracks;
			this.trackIndex = startIndex;
		},
		setQueueFiller(filler: { dispose(): void } | null) {
			this.filler = filler;
		},
		subscribe(listener: () => void) {
			listeners.push(listener);
			return () => {};
		},
		trackIndex: 0,
		tracks: [] as Array<Track>,
	};
}

async function flush() {
	for (let i = 0; i < 10; i += 1) {
		await Promise.resolve();
	}
}

describe('startPagedPlayback', () => {
	it('plays the first page immediately rather than waiting for the whole collection', async () => {
		const store = makeStore();
		const source: TrackSource = (page) =>
			Promise.resolve<TrackPage>({ hasMore: page < 4, items: makeTracks((page - 1) * 5, 5) });

		startPagedPlayback(store, source, 5);
		await flush();

		expect(store.played).toHaveLength(1);
		expect(store.played[0].map((t) => t.id)).toEqual([
			'track-0',
			'track-1',
			'track-2',
			'track-3',
			'track-4',
		]);
	});

	// the whole point: what plays must not be bounded by what has been paged into the view
	it('registers a queue filler when more pages remain', async () => {
		const store = makeStore();
		const source: TrackSource = (page) =>
			Promise.resolve<TrackPage>({ hasMore: page < 4, items: makeTracks((page - 1) * 5, 5) });

		startPagedPlayback(store, source, 5);
		await flush();

		expect(store.filler).not.toBeNull();
	});

	it('registers no filler when the collection fits in one page', async () => {
		const store = makeStore();
		const source: TrackSource = () =>
			Promise.resolve<TrackPage>({ hasMore: false, items: makeTracks(0, 3) });

		startPagedPlayback(store, source, 5);
		await flush();

		expect(store.played).toHaveLength(1);
		expect(store.filler).toBeNull();
	});

	it('starts nothing when the collection is empty', async () => {
		const store = makeStore();
		const source: TrackSource = () => Promise.resolve<TrackPage>({ hasMore: false, items: [] });

		startPagedPlayback(store, source, 5);
		await flush();

		expect(store.played).toHaveLength(0);
		expect(store.filler).toBeNull();
	});

	it('starts nothing when the first page fails', async () => {
		const store = makeStore();
		const source: TrackSource = () => Promise.reject(new Error('offline'));

		startPagedPlayback(store, source, 5);
		await flush();

		expect(store.played).toHaveLength(0);
		expect(store.filler).toBeNull();
	});
});
