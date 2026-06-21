import { describe, expect, it } from 'bun:test';
import type { Transport } from '../transports/Transport';
import type { PlaylistEditError } from './PlaylistEditService';
import {
	ReconnectSyncCoordinator,
	type ReconnectSyncDeps,
	type SyncProgress,
} from './ReconnectSyncCoordinator';

const transport = {} as unknown as Transport;

type IdMapping = {
	imageUrl?: string;
	initialTrackId: string;
	localId: string;
	name: string;
	serverId: string;
};

interface FakeConfig {
	createFlush?: () => Promise<{
		errors: Array<{ error: string; name: string }>;
		idMappings: Array<IdMapping>;
	}>;
	createPending?: number;
	editAddedTracks?: Map<string, ReadonlyArray<string>>;
	editFlush?: () => Promise<Array<PlaylistEditError>>;
	editPending?: number;
	scrobbleAfter?: number;
	scrobbleOnAppReady?: () => Promise<void>;
	scrobblePending?: number;
}

function makeDeps(config: FakeConfig): {
	deps: ReconnectSyncDeps;
	downloadResumed: () => number;
	registeredPlaylists: () => Array<{
		playlist: { id: string; imageUrl?: string; name: string };
		trackIds: ReadonlyArray<string>;
	}>;
	remappedIds: () => Array<ReadonlyArray<{ localId: string; serverId: string }>>;
} {
	let downloadResumeCount = 0;
	const scrobbleAfter = config.scrobbleAfter ?? 0;
	const registered: Array<{
		playlist: { id: string; imageUrl?: string; name: string };
		trackIds: ReadonlyArray<string>;
	}> = [];
	const remapped: Array<ReadonlyArray<{ localId: string; serverId: string }>> = [];

	const deps: ReconnectSyncDeps = {
		downloadService: {
			onAppReady: () => {
				downloadResumeCount += 1;
			},
			registerSyncedPlaylist: (playlist, trackIds) => {
				registered.push({
					playlist: { id: playlist.id, imageUrl: playlist.imageUrl, name: playlist.name },
					trackIds,
				});
			},
		},
		playlistCreateService: {
			flush: config.createFlush ?? (() => Promise.resolve({ errors: [], idMappings: [] })),
			getPending: () => new Array(config.createPending ?? 0).fill({}),
			load: () => Promise.resolve(),
		},
		playlistEditService: {
			collectAddedTrackIds: (ids) =>
				Promise.resolve(
					config.editAddedTracks
						? new Map([...config.editAddedTracks].filter(([k]) => ids.includes(k)))
						: new Map(),
				),
			flush: config.editFlush ?? (() => Promise.resolve([] as Array<PlaylistEditError>)),
			getPendingCount: () => Promise.resolve(config.editPending ?? 0),
			remapPlaylistIds: (mapping) => {
				remapped.push(mapping);
			},
		},
		scrobbleService: {
			getPendingScrobbles: (() => {
				let calls = 0;
				return () => {
					// first read is the up-front snapshot; later reads are post-delivery
					calls += 1;
					return new Array(calls === 1 ? (config.scrobblePending ?? 0) : scrobbleAfter).fill({});
				};
			})(),
			onAppReady: config.scrobbleOnAppReady ?? (() => Promise.resolve()),
		},
	};

	return {
		deps,
		downloadResumed: () => downloadResumeCount,
		registeredPlaylists: () => registered,
		remappedIds: () => remapped,
	};
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
		// first emission announces syncing, last announces the final state
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

	it('remaps edit ops and registers playlists after successful creates', async () => {
		const mappings: Array<IdMapping> = [
			{
				imageUrl: 'https://img/mix.jpg',
				initialTrackId: 'track-1',
				localId: 'local-playlist-1',
				name: 'My Mix',
				serverId: 'server-abc',
			},
		];
		const { deps, registeredPlaylists, remappedIds } = makeDeps({
			createFlush: () => Promise.resolve({ errors: [], idMappings: mappings }),
			createPending: 1,
		});
		const coordinator = new ReconnectSyncCoordinator(deps);

		await coordinator.run(transport, () => {});

		expect(remappedIds()).toHaveLength(1);
		expect(remappedIds()[0]).toEqual([{ localId: 'local-playlist-1', serverId: 'server-abc' }]);
		expect(registeredPlaylists()).toHaveLength(1);
		expect(registeredPlaylists()[0].playlist).toEqual({
			id: 'server-abc',
			imageUrl: 'https://img/mix.jpg',
			name: 'My Mix',
		});
		expect(registeredPlaylists()[0].trackIds).toEqual(['track-1']);
	});

	it('includes all offline-added tracks when registering a synced playlist', async () => {
		const mappings: Array<IdMapping> = [
			{
				initialTrackId: 'track-1',
				localId: 'local-playlist-1',
				name: 'My Mix',
				serverId: 'server-abc',
			},
		];
		const addedTracks = new Map([['local-playlist-1', ['track-2', 'track-3']]]);
		const { deps, registeredPlaylists } = makeDeps({
			createFlush: () => Promise.resolve({ errors: [], idMappings: mappings }),
			createPending: 1,
			editAddedTracks: addedTracks,
		});
		const coordinator = new ReconnectSyncCoordinator(deps);

		await coordinator.run(transport, () => {});

		expect(registeredPlaylists()[0].trackIds).toEqual(['track-1', 'track-2', 'track-3']);
	});

	it('skips remap and register when no id mappings are returned', async () => {
		const { deps, registeredPlaylists, remappedIds } = makeDeps({
			createFlush: () => Promise.resolve({ errors: [], idMappings: [] }),
			createPending: 0,
		});
		const coordinator = new ReconnectSyncCoordinator(deps);

		await coordinator.run(transport, () => {});

		expect(remappedIds()).toHaveLength(0);
		expect(registeredPlaylists()).toHaveLength(0);
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
