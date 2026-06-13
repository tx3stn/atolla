import { describe, expect, it } from 'bun:test';
import {
	type PendingScrobble,
	ScrobbleService,
	type ScrobbleServiceOptions,
	type ScrobbleStore,
} from './ScrobbleService';

class InMemoryScrobbleStore implements ScrobbleStore {
	private values = new Map<string, string>();

	fetchString(key: string): Promise<string> {
		const value = this.values.get(key);
		if (value == null) {
			return Promise.reject(new Error('missing key'));
		}
		return Promise.resolve(value);
	}

	storeString(key: string, value: string): Promise<void> {
		this.values.set(key, value);
		return Promise.resolve();
	}
}

function createService(
	options: Partial<Omit<ScrobbleServiceOptions, 'deliverScrobble' | 'store'>> & {
		deliverScrobble?: ScrobbleServiceOptions['deliverScrobble'];
		store?: InMemoryScrobbleStore;
	} = {},
): {
	deliverCalls: Array<PendingScrobble>;
	service: ScrobbleService;
	store: InMemoryScrobbleStore;
	time: { nowMs: number };
} {
	const store = options.store ?? new InMemoryScrobbleStore();
	const deliverCalls: Array<PendingScrobble> = [];
	const time = { nowMs: options.now?.() ?? Date.UTC(2026, 0, 1, 0, 0, 0) };
	const deliverScrobble =
		options.deliverScrobble ??
		((pending: PendingScrobble) => {
			deliverCalls.push(pending);
			return Promise.resolve();
		});

	const service = new ScrobbleService({
		deliverScrobble,
		maxAgeMs: options.maxAgeMs,
		now: () => time.nowMs,
		store,
		thresholdRatio: options.thresholdRatio,
	});

	return { deliverCalls, service, store, time };
}

describe('ScrobbleService', () => {
	it('creates and attempts a scrobble when active listening crosses threshold', async () => {
		const { deliverCalls, service } = createService();

		service.observePlayback({
			hasSeekTarget: false,
			isPlaying: true,
			progressSeconds: 0,
			trackDurationSeconds: 200,
			trackId: 'track-1',
		});
		service.observePlayback({
			hasSeekTarget: false,
			isPlaying: true,
			progressSeconds: 100,
			trackDurationSeconds: 200,
			trackId: 'track-1',
		});
		service.observePlayback({
			hasSeekTarget: false,
			isPlaying: true,
			progressSeconds: 160,
			trackDurationSeconds: 200,
			trackId: 'track-1',
		});

		await service.flush();

		expect(deliverCalls).toHaveLength(1);
		expect(deliverCalls[0].trackId).toBe('track-1');
		expect(service.getPendingScrobbles()).toHaveLength(0);
	});

	it('keeps accrued listen time across a mid-track backward scrub', async () => {
		const { deliverCalls, service } = createService();
		const base = {
			hasSeekTarget: false,
			isPlaying: true,
			trackDurationSeconds: 200, // threshold = 160s of active listening
			trackId: 'track-1',
		};

		service.observePlayback({ ...base, progressSeconds: 0 });
		service.observePlayback({ ...base, progressSeconds: 100 }); // +100 → 100
		service.observePlayback({ ...base, progressSeconds: 150 }); // +50 → 150 (still below threshold)
		service.observePlayback({ ...base, progressSeconds: 120 }); // backward scrub, mid-track
		service.observePlayback({ ...base, progressSeconds: 140 }); // +20 → 170 ≥ 160 → scrobble

		await service.flush();

		expect(deliverCalls).toHaveLength(1);
		expect(deliverCalls[0].trackId).toBe('track-1');
	});

	it('does not count seek jumps toward active listen time', async () => {
		const { deliverCalls, service } = createService();

		service.observePlayback({
			hasSeekTarget: false,
			isPlaying: true,
			progressSeconds: 0,
			trackDurationSeconds: 200,
			trackId: 'track-1',
		});
		service.observePlayback({
			hasSeekTarget: true,
			isPlaying: true,
			progressSeconds: 150,
			trackDurationSeconds: 200,
			trackId: 'track-1',
		});
		service.observePlayback({
			hasSeekTarget: false,
			isPlaying: true,
			progressSeconds: 160,
			trackDurationSeconds: 200,
			trackId: 'track-1',
		});

		await service.flush();

		expect(deliverCalls).toHaveLength(0);
	});

	it('does not re-trigger within the same play after threshold is crossed', async () => {
		const { deliverCalls, service } = createService();

		service.observePlayback({
			hasSeekTarget: false,
			isPlaying: true,
			progressSeconds: 0,
			trackDurationSeconds: 100,
			trackId: 'track-1',
		});
		service.observePlayback({
			hasSeekTarget: false,
			isPlaying: true,
			progressSeconds: 80,
			trackDurationSeconds: 100,
			trackId: 'track-1',
		});
		service.observePlayback({
			hasSeekTarget: true,
			isPlaying: true,
			progressSeconds: 20,
			trackDurationSeconds: 100,
			trackId: 'track-1',
		});
		service.observePlayback({
			hasSeekTarget: false,
			isPlaying: true,
			progressSeconds: 95,
			trackDurationSeconds: 100,
			trackId: 'track-1',
		});

		await service.flush();

		expect(deliverCalls).toHaveLength(1);
	});

	it('re-arms for a new play of the same track after progress resets', async () => {
		const { deliverCalls, service } = createService();

		service.observePlayback({
			hasSeekTarget: false,
			isPlaying: true,
			progressSeconds: 0,
			trackDurationSeconds: 100,
			trackId: 'track-1',
		});
		service.observePlayback({
			hasSeekTarget: false,
			isPlaying: true,
			progressSeconds: 80,
			trackDurationSeconds: 100,
			trackId: 'track-1',
		});
		service.observePlayback({
			hasSeekTarget: false,
			isPlaying: true,
			progressSeconds: 0,
			trackDurationSeconds: 100,
			trackId: 'track-1',
		});
		service.observePlayback({
			hasSeekTarget: false,
			isPlaying: true,
			progressSeconds: 80,
			trackDurationSeconds: 100,
			trackId: 'track-1',
		});

		await service.flush();

		expect(deliverCalls).toHaveLength(2);
	});

	it('keeps failed deliveries pending and retries them on app ready', async () => {
		let failFirst = true;
		const { service } = createService({
			deliverScrobble: () => {
				if (failFirst) {
					failFirst = false;
					return Promise.reject(new Error('network failure'));
				}
				return Promise.resolve();
			},
		});

		service.observePlayback({
			hasSeekTarget: false,
			isPlaying: true,
			progressSeconds: 0,
			trackDurationSeconds: 100,
			trackId: 'track-1',
		});
		service.observePlayback({
			hasSeekTarget: false,
			isPlaying: true,
			progressSeconds: 80,
			trackDurationSeconds: 100,
			trackId: 'track-1',
		});

		await service.flush();
		expect(service.getPendingScrobbles()).toHaveLength(1);

		await service.onAppReady();
		await service.flush();

		expect(service.getPendingScrobbles()).toHaveLength(0);
	});

	it('retries oldest pending first and stops after three consecutive failures', async () => {
		const seededStore = new InMemoryScrobbleStore();
		await seededStore.storeString(
			'pending_scrobbles',
			JSON.stringify([
				{ trackId: 'track-1', triggeredAt: '2026-01-01T00:00:01.000Z' },
				{ trackId: 'track-2', triggeredAt: '2026-01-01T00:00:02.000Z' },
				{ trackId: 'track-3', triggeredAt: '2026-01-01T00:00:03.000Z' },
				{ trackId: 'track-4', triggeredAt: '2026-01-01T00:00:04.000Z' },
			]),
		);

		const attempted: Array<string> = [];
		const { service } = createService({
			deliverScrobble: (pending) => {
				attempted.push(pending.trackId);
				return Promise.reject(new Error('still offline'));
			},
			store: seededStore,
		});

		await service.onAppReady();
		await service.flush();

		expect(attempted).toEqual(['track-1', 'track-2', 'track-3']);
		expect(service.getPendingScrobbles().map((pending) => pending.trackId)).toEqual([
			'track-1',
			'track-2',
			'track-3',
			'track-4',
		]);
	});

	it('delivers two same-timestamp scrobbles for the same track independently', async () => {
		const seededStore = new InMemoryScrobbleStore();
		await seededStore.storeString(
			'pending_scrobbles',
			JSON.stringify([
				{ id: 'id-1', trackId: 'track-x', triggeredAt: '2026-01-01T00:00:00.000Z' },
				{ id: 'id-2', trackId: 'track-x', triggeredAt: '2026-01-01T00:00:00.000Z' },
			]),
		);

		const deliveredIds: Array<string | undefined> = [];
		const { service } = createService({
			deliverScrobble: (pending) => {
				deliveredIds.push(pending.id);
				return Promise.resolve();
			},
			store: seededStore,
		});

		await service.onAppReady();

		expect(deliveredIds).toHaveLength(2);
		expect(deliveredIds).toContain('id-1');
		expect(deliveredIds).toContain('id-2');
		expect(service.getPendingScrobbles()).toHaveLength(0);
	});

	it('prunes pending scrobbles older than max age before startup retries', async () => {
		const seededStore = new InMemoryScrobbleStore();
		await seededStore.storeString(
			'pending_scrobbles',
			JSON.stringify([
				{ trackId: 'expired', triggeredAt: '2025-11-01T00:00:00.000Z' },
				{ trackId: 'fresh', triggeredAt: '2025-12-25T00:00:00.000Z' },
			]),
		);

		const attempted: Array<string> = [];
		const { service } = createService({
			deliverScrobble: (pending) => {
				attempted.push(pending.trackId);
				return Promise.resolve();
			},
			now: () => Date.UTC(2026, 0, 1, 0, 0, 0),
			store: seededStore,
		});

		await service.onAppReady();
		await service.flush();

		expect(attempted).toEqual(['fresh']);
		expect(service.getPendingScrobbles()).toHaveLength(0);
	});
});
