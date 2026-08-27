import { describe, expect, it } from 'bun:test';
import type { Lyrics } from 'atolla_core/src/models/Lyrics';
import type { Track } from 'atolla_core/src/models/Track';
import { TransportErrors } from 'atolla_core/src/transports/Errors';
import type { Transport } from 'atolla_core/src/transports/Transport';
import { type InternalError, isErrorConst } from 'atolla_core/src/utils/Errors';
import type { LyricsStorage } from '../stores/LyricsStore';
import { LyricsService } from './LyricsService';

const lyrics: Lyrics = { lines: [{ startSeconds: 0, text: 'a line' }], synced: true };

function track(overrides: Partial<Track> = {}): Track {
	return { duration: 100, id: 'track-1', name: 'A Song', ...overrides };
}

function createStorage(initial: Record<string, Lyrics | null> = {}) {
	const saved = new Map<string, Lyrics | null>(Object.entries(initial));
	const calls = { count: 0, load: 0, save: 0 };
	const storage: LyricsStorage = {
		clearAll: () => {
			saved.clear();
			return Promise.resolve();
		},
		count: () => {
			calls.count += 1;
			return Promise.resolve(saved.size);
		},
		loadLyrics: (trackId) => {
			calls.load += 1;
			return Promise.resolve(saved.has(trackId) ? saved.get(trackId) : undefined);
		},
		saveLyrics: (trackId, value) => {
			calls.save += 1;
			saved.set(trackId, value);
			return Promise.resolve();
		},
	};

	return { calls, saved, storage };
}

function createTransport(result: Lyrics | null | Error | InternalError<string> = lyrics) {
	const calls: Array<string> = [];
	const transport = {
		getLyrics: (trackId: string) => {
			calls.push(trackId);
			if (result instanceof Error || isErrorConst(result)) {
				return Promise.reject(result);
			}

			return Promise.resolve(result);
		},
	} as unknown as Transport;

	return { calls, transport };
}

describe('LyricsService', () => {
	it('fetches from the transport on a cold cache and persists the result', async () => {
		const { calls: storeCalls, saved, storage } = createStorage();
		const { calls, transport } = createTransport();
		const service = new LyricsService({ getTransport: () => transport, store: storage });

		expect(await service.load(track({ hasLyrics: true }))).toEqual(lyrics);
		expect(calls).toEqual(['track-1']);
		expect(storeCalls.save).toBe(1);
		expect(saved.get('track-1')).toEqual(lyrics);
	});

	it('serves a second read from memory without touching disk or the transport', async () => {
		const { calls: storeCalls, storage } = createStorage();
		const { calls, transport } = createTransport();
		const service = new LyricsService({ getTransport: () => transport, store: storage });

		await service.load(track({ hasLyrics: true }));
		const loadsAfterFirst = storeCalls.load;
		await service.load(track({ hasLyrics: true }));

		expect(calls).toEqual(['track-1']);
		expect(storeCalls.load).toBe(loadsAfterFirst);
	});

	it('prefers the disk cache over the transport', async () => {
		const { storage } = createStorage({ 'track-1': lyrics });
		const { calls, transport } = createTransport();
		const service = new LyricsService({ getTransport: () => transport, store: storage });

		expect(await service.load(track({ hasLyrics: true }))).toEqual(lyrics);
		expect(calls).toEqual([]);
	});

	it('reads the disk cache even when the track claims it has no lyrics', async () => {
		const { storage } = createStorage({ 'track-1': lyrics });
		const { transport } = createTransport();
		const service = new LyricsService({ getTransport: () => transport, store: storage });

		expect(await service.load(track({ hasLyrics: false }))).toEqual(lyrics);
	});

	it('skips the transport for a track the server says has no lyrics', async () => {
		const { storage } = createStorage();
		const { calls, transport } = createTransport();
		const service = new LyricsService({ getTransport: () => transport, store: storage });

		expect(await service.load(track({ hasLyrics: false }))).toBeNull();
		expect(calls).toEqual([]);
	});

	it('asks the transport when the track does not say either way', async () => {
		const { storage } = createStorage();
		const { calls, transport } = createTransport();
		const service = new LyricsService({ getTransport: () => transport, store: storage });

		expect(await service.load(track())).toEqual(lyrics);
		expect(calls).toEqual(['track-1']);
	});

	it('caches a server miss so the same track is only asked about once', async () => {
		const { saved, storage } = createStorage();
		const { calls, transport } = createTransport(null);
		const service = new LyricsService({ getTransport: () => transport, store: storage });

		expect(await service.load(track({ hasLyrics: true }))).toBeNull();
		expect(await service.load(track({ hasLyrics: true }))).toBeNull();

		expect(calls).toEqual(['track-1']);
		expect(saved.get('track-1')).toBeNull();
	});

	it('refetches a stored miss once the server says the track has lyrics', async () => {
		const { saved, storage } = createStorage({ 'track-1': null });
		const { calls, transport } = createTransport();
		const service = new LyricsService({ getTransport: () => transport, store: storage });

		expect(await service.load(track({ hasLyrics: true }))).toEqual(lyrics);
		expect(calls).toEqual(['track-1']);
		expect(saved.get('track-1')).toEqual(lyrics);
	});

	it('keeps trusting a stored miss when the server still reports no lyrics', async () => {
		const { storage } = createStorage({ 'track-1': null });
		const { calls, transport } = createTransport();
		const service = new LyricsService({ getTransport: () => transport, store: storage });

		expect(await service.load(track({ hasLyrics: false }))).toBeNull();
		expect(calls).toEqual([]);
	});

	it('keeps trusting a stored miss when the server says nothing either way', async () => {
		const { storage } = createStorage({ 'track-1': null });
		const { calls, transport } = createTransport();
		const service = new LyricsService({ getTransport: () => transport, store: storage });

		expect(await service.load(track())).toBeNull();
		expect(calls).toEqual([]);
	});

	it('records nothing when offline cannot answer, so the next read retries', async () => {
		const { calls: storeCalls, storage } = createStorage();
		const { calls, transport } = createTransport(TransportErrors.OFFLINE_LYRICS);
		const service = new LyricsService({ getTransport: () => transport, store: storage });

		expect(await service.load(track({ hasLyrics: true }))).toBeNull();
		expect(storeCalls.save).toBe(0);
		expect(service.get('track-1')).toBeUndefined();

		expect(await service.load(track({ hasLyrics: true }))).toBeNull();
		expect(calls).toEqual(['track-1', 'track-1']);
	});

	it('rejects on a transport failure and does not cache it as a miss', async () => {
		const { calls: storeCalls, storage } = createStorage();
		const { calls, transport } = createTransport(new Error('boom'));
		const service = new LyricsService({ getTransport: () => transport, store: storage });

		await expect(service.load(track({ hasLyrics: true }))).rejects.toThrow('boom');
		expect(storeCalls.save).toBe(0);

		await expect(service.load(track({ hasLyrics: true }))).rejects.toThrow('boom');
		expect(calls).toEqual(['track-1', 'track-1']);
	});

	it('shares one in-flight request between concurrent readers', async () => {
		const { storage } = createStorage();
		const { calls, transport } = createTransport();
		const service = new LyricsService({ getTransport: () => transport, store: storage });

		const [first, second] = await Promise.all([
			service.load(track({ hasLyrics: true })),
			service.load(track({ hasLyrics: true })),
		]);

		expect(first).toEqual(lyrics);
		expect(second).toEqual(lyrics);
		expect(calls).toEqual(['track-1']);
	});

	it('exposes a resident entry synchronously and reports an unread one as unknown', async () => {
		const { storage } = createStorage();
		const { transport } = createTransport();
		const service = new LyricsService({ getTransport: () => transport, store: storage });

		expect(service.get('track-1')).toBeUndefined();
		await service.load(track({ hasLyrics: true }));
		expect(service.get('track-1')).toEqual(lyrics);
	});

	it('warms the cache on prefetch but leaves no-lyrics tracks alone', async () => {
		const { storage } = createStorage();
		const { calls, transport } = createTransport();
		const service = new LyricsService({ getTransport: () => transport, store: storage });

		service.prefetch(track({ hasLyrics: false, id: 'track-2' }));
		service.prefetch(track({ hasLyrics: true }));
		await Promise.resolve();
		await Promise.resolve();

		expect(calls).toEqual(['track-1']);
	});

	it('swallows a prefetch failure', () => {
		const { storage } = createStorage();
		const { transport } = createTransport(new Error('boom'));
		const service = new LyricsService({ getTransport: () => transport, store: storage });

		expect(() => service.prefetch(track({ hasLyrics: true }))).not.toThrow();
	});

	it('drops resident and persisted entries on clear', async () => {
		const { saved, storage } = createStorage();
		const { transport } = createTransport();
		const service = new LyricsService({ getTransport: () => transport, store: storage });
		await service.load(track({ hasLyrics: true }));

		await service.clearAll();

		expect(service.get('track-1')).toBeUndefined();
		expect(saved.size).toBe(0);
	});

	it('reports how many entries the cache holds', async () => {
		const { storage } = createStorage({ 'track-1': lyrics, 'track-2': null });
		const { transport } = createTransport();
		const service = new LyricsService({ getTransport: () => transport, store: storage });

		expect(await service.cachedCount()).toBe(2);
	});
});
