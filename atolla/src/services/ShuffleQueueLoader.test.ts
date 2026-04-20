import { describe, expect, it } from 'bun:test';
import type { Track } from '../models/Track';
import { SHUFFLE_PAGE_SIZE, ShuffleQueueLoader } from './ShuffleQueueLoader';

function createTrack(id: string): Track {
	return { duration: 180, id, name: `Track ${id}` };
}

function createTracks(count: number, prefix = 't'): Array<Track> {
	return Array.from({ length: count }, (_, i) => createTrack(`${prefix}${i + 1}`));
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

interface MockStore {
	addedTracks: Array<Track>;
	addToQueue(tracks: Array<Track>): void;
	advance(steps?: number): void;
	listeners: Set<() => void>;
	subscribe(listener: () => void): () => void;
	trackIndex: number;
	tracks: Array<Track>;
}

function createMockStore(initialTracks: Array<Track>, initialIndex = 0): MockStore {
	const listeners = new Set<() => void>();
	const addedTracks: Array<Track> = [];

	const store: MockStore = {
		addedTracks,
		addToQueue(tracks) {
			store.tracks = [...store.tracks, ...tracks];
			addedTracks.push(...tracks);
			for (const l of listeners) l();
		},
		advance(steps = 1) {
			store.trackIndex = Math.min(store.trackIndex + steps, store.tracks.length - 1);
			for (const l of listeners) l();
		},
		listeners,
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		trackIndex: initialIndex,
		tracks: [...initialTracks],
	};

	return store;
}

describe('ShuffleQueueLoader', () => {
	it('fetches the next page when remaining tracks fall at or below the threshold', async () => {
		const initialTracks = createTracks(11);
		const store = createMockStore(initialTracks, 1);
		const nextPageTracks = createTracks(5, 'p2-');
		let fetchCallCount = 0;

		const loader = new ShuffleQueueLoader(
			store,
			() => {
				fetchCallCount++;
				return Promise.resolve({ hasMore: false, items: nextPageTracks });
			},
			SHUFFLE_PAGE_SIZE,
		);

		loader.start(2, true);
		await waitFor(() => fetchCallCount === 1);

		expect(fetchCallCount).toBe(1);
		expect(store.addedTracks).toEqual(nextPageTracks);
		loader.dispose();
	});

	it('does not fetch when remaining tracks are above the threshold', async () => {
		const initialTracks = createTracks(25);
		const store = createMockStore(initialTracks, 0);
		let fetchCallCount = 0;

		const loader = new ShuffleQueueLoader(
			store,
			() => {
				fetchCallCount++;
				return Promise.resolve({ hasMore: false, items: [] });
			},
			SHUFFLE_PAGE_SIZE,
		);

		loader.start(2, true);
		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(fetchCallCount).toBe(0);
		loader.dispose();
	});

	it('does not fetch when hasMore is false', async () => {
		const initialTracks = createTracks(5);
		const store = createMockStore(initialTracks, 0);
		let fetchCallCount = 0;

		const loader = new ShuffleQueueLoader(
			store,
			() => {
				fetchCallCount++;
				return Promise.resolve({ hasMore: false, items: [] });
			},
			SHUFFLE_PAGE_SIZE,
		);

		loader.start(2, false);
		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(fetchCallCount).toBe(0);
		loader.dispose();
	});

	it('does not start a second fetch while one is already in progress', async () => {
		const initialTracks = createTracks(5);
		const store = createMockStore(initialTracks, 0);
		let fetchCallCount = 0;
		let resolveFetch!: () => void;

		const loader = new ShuffleQueueLoader(
			store,
			() => {
				fetchCallCount++;
				return new Promise((resolve) => {
					resolveFetch = () => resolve({ hasMore: false, items: [] });
				});
			},
			SHUFFLE_PAGE_SIZE,
		);

		loader.start(2, true);
		await waitFor(() => fetchCallCount === 1);

		store.advance();
		store.advance();
		await new Promise((resolve) => setTimeout(resolve, 20));

		expect(fetchCallCount).toBe(1);
		resolveFetch();
		loader.dispose();
	});

	it('passes the correct page number and page size to fetchPage', async () => {
		const initialTracks = createTracks(5);
		const store = createMockStore(initialTracks, 0);
		const calls: Array<{ page: number; pageSize: number }> = [];

		const loader = new ShuffleQueueLoader(
			store,
			(page, pageSize) => {
				calls.push({ page, pageSize });
				return Promise.resolve({ hasMore: false, items: [] });
			},
			SHUFFLE_PAGE_SIZE,
		);

		loader.start(2, true);
		await waitFor(() => calls.length === 1);

		expect(calls[0]).toEqual({ page: 2, pageSize: SHUFFLE_PAGE_SIZE });
		loader.dispose();
	});

	it('increments the page number for subsequent fetches', async () => {
		const initialTracks = createTracks(5);
		const store = createMockStore(initialTracks, 0);
		const pages: Array<number> = [];
		let callCount = 0;

		const loader = new ShuffleQueueLoader(
			store,
			(page) => {
				callCount++;
				pages.push(page);
				return Promise.resolve({ hasMore: callCount < 2, items: createTracks(3, `p${page}-`) });
			},
			SHUFFLE_PAGE_SIZE,
		);

		loader.start(2, true);
		await waitFor(() => pages.length === 2);

		expect(pages).toEqual([2, 3]);
		loader.dispose();
	});

	it('sets hasMore to false and stops fetching when the last page is received', async () => {
		const initialTracks = createTracks(5);
		const store = createMockStore(initialTracks, 0);
		let fetchCallCount = 0;

		const loader = new ShuffleQueueLoader(
			store,
			() => {
				fetchCallCount++;
				return Promise.resolve({ hasMore: false, items: createTracks(3, 'p-') });
			},
			SHUFFLE_PAGE_SIZE,
		);

		loader.start(2, true);
		await waitFor(() => fetchCallCount === 1);

		store.advance();
		store.advance();
		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(fetchCallCount).toBe(1);
		loader.dispose();
	});

	it('discards stale results after dispose is called', async () => {
		const initialTracks = createTracks(5);
		const store = createMockStore(initialTracks, 0);
		let resolveFetch!: () => void;

		const loader = new ShuffleQueueLoader(
			store,
			() =>
				new Promise((resolve) => {
					resolveFetch = () => resolve({ hasMore: false, items: createTracks(3, 'stale-') });
				}),
			SHUFFLE_PAGE_SIZE,
		);

		loader.start(2, true);
		await new Promise((resolve) => setTimeout(resolve, 20));

		loader.dispose();
		resolveFetch();

		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(store.addedTracks).toHaveLength(0);
	});

	it('does not add empty items to the queue', async () => {
		const initialTracks = createTracks(5);
		const store = createMockStore(initialTracks, 0);

		const loader = new ShuffleQueueLoader(
			store,
			() => Promise.resolve({ hasMore: false, items: [] }),
			SHUFFLE_PAGE_SIZE,
		);

		loader.start(2, true);
		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(store.addedTracks).toHaveLength(0);
		loader.dispose();
	});

	it('unsubscribes from the store on dispose', () => {
		const initialTracks = createTracks(5);
		const store = createMockStore(initialTracks, 0);

		const loader = new ShuffleQueueLoader(
			store,
			() => Promise.resolve({ hasMore: true, items: [] }),
			SHUFFLE_PAGE_SIZE,
		);

		loader.start(2, true);
		expect(store.listeners.size).toBe(1);

		loader.dispose();
		expect(store.listeners.size).toBe(0);
	});
});
