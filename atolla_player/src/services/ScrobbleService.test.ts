import { describe, expect, it, spyOn } from 'bun:test';
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
