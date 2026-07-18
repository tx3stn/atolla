import { describe, expect, it, spyOn } from 'bun:test';
import type { IHTTPClient } from 'valdi_http/src/IHTTPClient';
import { LiveTransport } from '../transports/Live';
import { type NativeScrobbleQueue, type PendingScrobble, ScrobbleService } from './ScrobbleService';

const TEST_NOW = Date.UTC(2026, 0, 15, 0, 0, 0);

type FakeQueue = NativeScrobbleQueue & { entries: Array<PendingScrobble> };

function createQueue(initial: Array<PendingScrobble> = []): FakeQueue {
	const entries = [...initial];
	return {
		ack: (trackId: string, playedAtMs: number) => {
			const index = entries.findIndex((e) => e.trackId === trackId && e.playedAtMs === playedAtMs);
			if (index >= 0) {
				entries.splice(index, 1);
			}
		},
		entries,
		read: () => [...entries],
	};
}

function createService(
	options: {
		deliverScrobble?: (trackId: string, playedAtIso: string) => Promise<void>;
		maxAgeMs?: number;
		now?: () => number;
		queue?: FakeQueue;
	} = {},
): {
	delivered: Array<{ playedAtIso: string; trackId: string }>;
	queue: FakeQueue;
	service: ScrobbleService;
} {
	const queue = options.queue ?? createQueue();
	const delivered: Array<{ playedAtIso: string; trackId: string }> = [];
	const deliverScrobble =
		options.deliverScrobble ??
		((trackId: string, playedAtIso: string) => {
			delivered.push({ playedAtIso, trackId });
			return Promise.resolve();
		});
	const service = new ScrobbleService({
		deliverScrobble,
		maxAgeMs: options.maxAgeMs,
		now: options.now ?? (() => TEST_NOW),
		queue,
	});
	return { delivered, queue, service };
}

describe('ScrobbleService', () => {
	it('reports the native pending count', () => {
		const { service } = createService({
			queue: createQueue([
				{ playedAtMs: TEST_NOW - 2000, trackId: 'a' },
				{ playedAtMs: TEST_NOW - 1000, trackId: 'b' },
			]),
		});
		expect(service.getPendingCount()).toBe(2);
	});

	it('delivers all pending oldest-first and acks each', async () => {
		const queue = createQueue([
			{ playedAtMs: TEST_NOW - 2000, trackId: 'a' },
			{ playedAtMs: TEST_NOW - 1000, trackId: 'b' },
		]);
		const { service, delivered } = createService({ queue });

		await service.syncFromNative();

		expect(delivered.map((d) => d.trackId)).toEqual(['a', 'b']);
		expect(queue.entries).toHaveLength(0);
	});

	it('converts the epoch ms to an ISO date for delivery', async () => {
		const playedAtMs = Date.UTC(2026, 0, 1, 0, 0, 0);
		const queue = createQueue([{ playedAtMs, trackId: 'a' }]);
		const { service, delivered } = createService({ queue });

		await service.syncFromNative();

		expect(delivered[0].playedAtIso).toBe('2026-01-01T00:00:00.000Z');
	});

	it('keeps a failed delivery queued and stops after three consecutive failures', async () => {
		const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
		try {
			const queue = createQueue([
				{ playedAtMs: TEST_NOW - 4000, trackId: 'a' },
				{ playedAtMs: TEST_NOW - 3000, trackId: 'b' },
				{ playedAtMs: TEST_NOW - 2000, trackId: 'c' },
				{ playedAtMs: TEST_NOW - 1000, trackId: 'd' },
			]);
			const attempted: Array<string> = [];
			const { service } = createService({
				deliverScrobble: (trackId) => {
					attempted.push(trackId);
					return Promise.reject(new Error('offline'));
				},
				queue,
			});

			await service.syncFromNative();

			expect(attempted).toEqual(['a', 'b', 'c']);
			expect(queue.entries).toHaveLength(4);
			expect(warnSpy).toHaveBeenCalled();
		} finally {
			warnSpy.mockRestore();
		}
	});

	it('delivers again on the next sync after a transient failure clears', async () => {
		const queue = createQueue([{ playedAtMs: TEST_NOW - 1000, trackId: 'a' }]);
		let failNext = true;
		const { service } = createService({
			deliverScrobble: () => {
				if (failNext) {
					failNext = false;
					return Promise.reject(new Error('offline'));
				}
				return Promise.resolve();
			},
			queue,
		});

		await service.syncFromNative();
		expect(queue.entries).toHaveLength(1);

		await service.syncFromNative();
		expect(queue.entries).toHaveLength(0);
	});

	it('acks stale entries without delivering them', async () => {
		const queue = createQueue([
			{ playedAtMs: TEST_NOW - 40 * 24 * 60 * 60 * 1000, trackId: 'stale' },
			{ playedAtMs: TEST_NOW - 1000, trackId: 'fresh' },
		]);
		const { service, delivered } = createService({ queue });

		await service.syncFromNative();

		expect(delivered.map((d) => d.trackId)).toEqual(['fresh']);
		expect(queue.entries).toHaveLength(0);
	});

	it('does not deliver concurrently when already syncing', async () => {
		let releaseFirst: () => void = () => {};
		const gate = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});
		const queue = createQueue([{ playedAtMs: TEST_NOW - 1000, trackId: 'a' }]);
		let calls = 0;
		const { service } = createService({
			deliverScrobble: () => {
				calls += 1;
				return gate;
			},
			queue,
		});

		const first = service.syncFromNative();
		const second = service.syncFromNative();
		releaseFirst();
		await Promise.all([first, second]);

		expect(calls).toBe(1);
	});
});

// exercises the real ScrobbleService -> LiveTransport -> HTTP path (the delivery seam), rather than
// a stubbed deliverScrobble
describe('ScrobbleService with LiveTransport', () => {
	function createHTTPClient(
		statusCode: number,
		body?: Uint8Array,
	): { calls: Array<{ method: string; pathOrUrl: string }>; client: IHTTPClient } {
		const calls: Array<{ method: string; pathOrUrl: string }> = [];
		const respond = (method: string) => (pathOrUrl: string) => {
			calls.push({ method, pathOrUrl });
			return Promise.resolve({ body, headers: {}, statusCode });
		};
		const client = { delete: respond('delete'), get: respond('get'), post: respond('post') };
		return { calls, client: client as unknown as IHTTPClient };
	}

	function serviceWith(client: IHTTPClient, queue: FakeQueue): ScrobbleService {
		const transport = new LiveTransport('https://demo.jellyfin.local', 'token-1', 'user-1', client);
		return new ScrobbleService({
			deliverScrobble: (trackId, playedAtIso) =>
				transport.scrobbleTrackPlayed(trackId, playedAtIso),
			now: () => TEST_NOW,
			queue,
		});
	}

	it('delivers a native pending scrobble to the server and acks it on 200', async () => {
		const { calls, client } = createHTTPClient(200);
		const queue = createQueue([{ playedAtMs: TEST_NOW - 1000, trackId: 'track-1' }]);
		const service = serviceWith(client, queue);

		await service.syncFromNative();

		expect(calls).toHaveLength(1);
		expect(calls[0].method).toBe('post');
		expect(calls[0].pathOrUrl).toContain('/UserPlayedItems/track-1');
		expect(calls[0].pathOrUrl).toContain('datePlayed=');
		expect(queue.entries).toHaveLength(0);
	});

	it('keeps the scrobble queued and logs when the server returns 400', async () => {
		const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
		try {
			const { calls, client } = createHTTPClient(400, new TextEncoder().encode('{"Error":"bad"}'));
			const queue = createQueue([{ playedAtMs: TEST_NOW - 1000, trackId: 'track-1' }]);
			const service = serviceWith(client, queue);

			await service.syncFromNative();

			expect(calls).toHaveLength(1);
			expect(queue.entries).toHaveLength(1);
			expect(warnSpy).toHaveBeenCalled();
		} finally {
			warnSpy.mockRestore();
		}
	});
});
