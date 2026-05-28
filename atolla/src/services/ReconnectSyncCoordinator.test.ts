import { describe, expect, it } from 'bun:test';
import type { Transport } from '../transports/Transport';
import type { PlaylistEditError } from './PlaylistEditService';
import {
	ReconnectSyncCoordinator,
	type ReconnectSyncDeps,
	type SyncProgress,
} from './ReconnectSyncCoordinator';

const transport = {} as unknown as Transport;

interface FakeConfig {
	createFlush?: () => Promise<Array<{ error: string; name: string }>>;
	createPending?: number;
	editFlush?: () => Promise<Array<PlaylistEditError>>;
	editPending?: number;
	scrobbleAfter?: number;
	scrobbleOnAppReady?: () => Promise<void>;
	scrobblePending?: number;
}

function makeDeps(config: FakeConfig): { deps: ReconnectSyncDeps; downloadResumed: () => number } {
	let downloadResumeCount = 0;
	const scrobbleAfter = config.scrobbleAfter ?? 0;

	const deps: ReconnectSyncDeps = {
		downloadService: {
			onAppReady: () => {
				downloadResumeCount += 1;
			},
		},
		playlistCreateService: {
			flush:
				config.createFlush ?? (() => Promise.resolve([] as Array<{ error: string; name: string }>)),
			getPending: () => new Array(config.createPending ?? 0).fill({}),
			load: () => Promise.resolve(),
		},
		playlistEditService: {
			flush: config.editFlush ?? (() => Promise.resolve([] as Array<PlaylistEditError>)),
			getPendingCount: () => Promise.resolve(config.editPending ?? 0),
		},
		scrobbleService: {
			getPendingScrobbles: (() => {
				let calls = 0;
				return () => {
					// First read is the up-front snapshot; later reads are post-delivery.
					calls += 1;
					return new Array(calls === 1 ? (config.scrobblePending ?? 0) : scrobbleAfter).fill({});
				};
			})(),
			onAppReady: config.scrobbleOnAppReady ?? (() => Promise.resolve()),
		},
	};

	return { deps, downloadResumed: () => downloadResumeCount };
}

describe('ReconnectSyncCoordinator', () => {
	it('reports done with total 0 and does not emit progress when nothing is pending', async () => {
		const { deps } = makeDeps({});
		const coordinator = new ReconnectSyncCoordinator(deps);
		const updates: Array<SyncProgress> = [];

		const result = await coordinator.run(transport, (p) => updates.push(p));

		expect(result).toEqual({
			completed: 0,
			failed: 0,
			playlistEditErrors: [],
			status: 'done',
			total: 0,
		});
		expect(updates).toEqual([]);
	});

	it('always resumes downloads in the background', async () => {
		const { deps, downloadResumed } = makeDeps({ createPending: 1 });
		const coordinator = new ReconnectSyncCoordinator(deps);

		await coordinator.run(transport, () => {});

		expect(downloadResumed()).toBe(1);
	});

	it('counts the total across all queues and marks done when everything syncs', async () => {
		const { deps } = makeDeps({
			createPending: 2,
			editPending: 1,
			scrobbleAfter: 0,
			scrobblePending: 3,
		});
		const coordinator = new ReconnectSyncCoordinator(deps);
		const updates: Array<SyncProgress> = [];

		const result = await coordinator.run(transport, (p) => updates.push(p));

		expect(result.total).toBe(6);
		expect(result.completed).toBe(6);
		expect(result.failed).toBe(0);
		expect(result.status).toBe('done');
		// First emission announces syncing, last announces the final state.
		expect(updates[0].status).toBe('syncing');
		expect(updates[updates.length - 1].status).toBe('done');
	});

	it('marks partial and surfaces playlist edit errors when some ops fail', async () => {
		const editErrors: Array<PlaylistEditError> = [
			{ error: 'read only', playlistName: 'Mix', type: 'move' },
		];
		const { deps } = makeDeps({
			editFlush: () => Promise.resolve(editErrors),
			editPending: 2,
		});
		const coordinator = new ReconnectSyncCoordinator(deps);

		const result = await coordinator.run(transport, () => {});

		expect(result.total).toBe(2);
		expect(result.completed).toBe(1);
		expect(result.failed).toBe(1);
		expect(result.status).toBe('partial');
		expect(result.playlistEditErrors).toEqual(editErrors);
	});

	it('never rejects even when a flush throws, counting the batch as failed', async () => {
		const { deps } = makeDeps({
			createFlush: () => Promise.reject(new Error('storage exploded')),
			createPending: 2,
		});
		const coordinator = new ReconnectSyncCoordinator(deps);

		const result = await coordinator.run(transport, () => {});

		expect(result.failed).toBe(2);
		expect(result.completed).toBe(0);
		expect(result.status).toBe('partial');
	});

	it('counts undelivered scrobbles as not-yet-synced', async () => {
		const { deps } = makeDeps({
			scrobbleAfter: 1, // one could not be delivered this round
			scrobblePending: 3,
		});
		const coordinator = new ReconnectSyncCoordinator(deps);

		const result = await coordinator.run(transport, () => {});

		expect(result.total).toBe(3);
		expect(result.completed).toBe(2);
		expect(result.failed).toBe(1);
		expect(result.status).toBe('partial');
	});

	it('does not reject when scrobble retry itself throws', async () => {
		const { deps } = makeDeps({
			scrobbleOnAppReady: () => Promise.reject(new Error('scrobble boom')),
			scrobblePending: 2,
		});
		const coordinator = new ReconnectSyncCoordinator(deps);

		const result = await coordinator.run(transport, () => {});

		expect(result.failed).toBe(2);
		expect(result.status).toBe('partial');
	});
});
