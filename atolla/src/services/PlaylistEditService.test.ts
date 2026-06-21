import { describe, expect, it } from 'bun:test';
import type { Transport } from '../transports/Transport';
import { PlaylistEditService, type PlaylistEditStore } from './PlaylistEditService';

class InMemoryStore implements PlaylistEditStore {
	private values = new Map<string, string>();

	fetchString(key: string): Promise<string> {
		const value = this.values.get(key);
		if (value == null) return Promise.reject(new Error('missing key'));
		return Promise.resolve(value);
	}

	storeString(key: string, value: string): Promise<void> {
		this.values.set(key, value);
		return Promise.resolve();
	}
}

function createTransportMock(): {
	moveCalls: Array<{ playlistId: string; toIndex: number; trackId: string }>;
	removeCalls: Array<{ playlistId: string; trackId: string }>;
	transport: Transport;
} {
	const moveCalls: Array<{ playlistId: string; toIndex: number; trackId: string }> = [];
	const removeCalls: Array<{ playlistId: string; trackId: string }> = [];
	const transport = {
		movePlaylistTrack: (playlistId: string, trackId: string, toIndex: number) => {
			moveCalls.push({ playlistId, toIndex, trackId });
			return Promise.resolve();
		},
		removePlaylistTrack: (playlistId: string, trackId: string) => {
			removeCalls.push({ playlistId, trackId });
			return Promise.resolve();
		},
	} as unknown as Transport;
	return { moveCalls, removeCalls, transport };
}

describe('PlaylistEditService', () => {
	it('flushes move operations to the transport in order', async () => {
		const store = new InMemoryStore();
		const service = new PlaylistEditService(store);
		const { moveCalls, transport } = createTransportMock();

		service.enqueue({
			playlistId: 'p1',
			playlistName: 'Playlist 1',
			toIndex: 2,
			trackId: 't1',
			type: 'move',
		});
		service.enqueue({
			playlistId: 'p1',
			playlistName: 'Playlist 1',
			toIndex: 0,
			trackId: 't2',
			type: 'move',
		});

		await service.flush(transport);

		expect(moveCalls).toEqual([
			{ playlistId: 'p1', toIndex: 2, trackId: 't1' },
			{ playlistId: 'p1', toIndex: 0, trackId: 't2' },
		]);
	});

	it('flushes remove operations to the transport', async () => {
		const store = new InMemoryStore();
		const service = new PlaylistEditService(store);
		const { removeCalls, transport } = createTransportMock();

		service.enqueue({
			playlistId: 'p1',
			playlistName: 'Playlist 1',
			trackId: 't3',
			type: 'remove',
		});

		await service.flush(transport);

		expect(removeCalls).toEqual([{ playlistId: 'p1', trackId: 't3' }]);
	});

	it('clears ops after a successful flush', async () => {
		const store = new InMemoryStore();
		const service = new PlaylistEditService(store);
		const { moveCalls, transport } = createTransportMock();

		service.enqueue({
			playlistId: 'p1',
			playlistName: 'Playlist 1',
			toIndex: 0,
			trackId: 't1',
			type: 'move',
		});
		await service.flush(transport);
		await service.flush(transport);

		expect(moveCalls).toHaveLength(1);
	});

	it('clears failed ops after flush so they are not retried', async () => {
		const store = new InMemoryStore();
		const service = new PlaylistEditService(store);

		const failingTransport = {
			movePlaylistTrack: () => Promise.reject(new Error('network error')),
		} as unknown as Transport;

		service.enqueue({
			playlistId: 'p1',
			playlistName: 'Playlist 1',
			toIndex: 0,
			trackId: 't1',
			type: 'move',
		});
		await service.flush(failingTransport);

		const { moveCalls, transport } = createTransportMock();
		await service.flush(transport);

		expect(moveCalls).toHaveLength(0);
	});

	it('returns error details for failed ops', async () => {
		const store = new InMemoryStore();
		const service = new PlaylistEditService(store);

		const failingTransport = {
			movePlaylistTrack: () => Promise.reject(new Error('playlist is read-only')),
			removePlaylistTrack: () => Promise.reject(new Error('permission denied')),
		} as unknown as Transport;

		service.enqueue({
			playlistId: 'p1',
			playlistName: 'Mix Tape',
			toIndex: 0,
			trackId: 't1',
			type: 'move',
		});
		service.enqueue({ playlistId: 'p1', playlistName: 'Mix Tape', trackId: 't2', type: 'remove' });
		const errors = await service.flush(failingTransport);

		expect(errors).toEqual([
			{ error: 'playlist is read-only', playlistName: 'Mix Tape', type: 'move' },
			{ error: 'permission denied', playlistName: 'Mix Tape', type: 'remove' },
		]);
	});

	it('returns empty array when all ops succeed', async () => {
		const store = new InMemoryStore();
		const service = new PlaylistEditService(store);
		const { transport } = createTransportMock();

		service.enqueue({
			playlistId: 'p1',
			playlistName: 'Playlist 1',
			toIndex: 0,
			trackId: 't1',
			type: 'move',
		});
		const errors = await service.flush(transport);

		expect(errors).toEqual([]);
	});

	describe('execute', () => {
		it('executes the op immediately and returns null on success', async () => {
			const store = new InMemoryStore();
			const service = new PlaylistEditService(store);
			const { moveCalls, transport } = createTransportMock();

			const result = await service.execute(
				{ playlistId: 'p1', playlistName: 'Playlist 1', toIndex: 2, trackId: 't1', type: 'move' },
				transport,
			);

			expect(result).toBeNull();
			expect(moveCalls).toEqual([{ playlistId: 'p1', toIndex: 2, trackId: 't1' }]);
		});

		it('returns the error and does not enqueue for retry when live transport fails', async () => {
			const store = new InMemoryStore();
			const service = new PlaylistEditService(store);

			const failingTransport = {
				removePlaylistTrack: () => Promise.reject(new Error('playlist is read-only')),
			} as unknown as Transport;

			const result = await service.execute(
				{ playlistId: 'p1', playlistName: 'Mix Tape', trackId: 't1', type: 'remove' },
				failingTransport,
			);

			expect(result).toEqual({
				error: 'playlist is read-only',
				playlistName: 'Mix Tape',
				type: 'remove',
			});

			const { removeCalls, transport } = createTransportMock();
			await service.flush(transport);
			expect(removeCalls).toHaveLength(0);
		});

		it('returns an error when the transport method throws', async () => {
			const store = new InMemoryStore();
			const service = new PlaylistEditService(store);
			const failingTransport = {
				removePlaylistTrack: () => Promise.reject(new Error('network error')),
			} as unknown as Transport;

			const result = await service.execute(
				{ playlistId: 'p1', playlistName: 'Mix Tape', trackId: 't1', type: 'remove' },
				failingTransport,
			);

			expect(result).not.toBeNull();
			expect(result?.type).toBe('remove');
			expect(result?.playlistName).toBe('Mix Tape');
		});

		it('does not enqueue on success so flush is a no-op', async () => {
			const store = new InMemoryStore();
			const service = new PlaylistEditService(store);
			const { moveCalls, transport } = createTransportMock();

			await service.execute(
				{ playlistId: 'p1', playlistName: 'Playlist 1', toIndex: 0, trackId: 't1', type: 'move' },
				transport,
			);
			await service.flush(transport);

			expect(moveCalls).toHaveLength(1);
		});
	});

	it('handles mixed move and remove ops in sequence', async () => {
		const store = new InMemoryStore();
		const service = new PlaylistEditService(store);
		const { moveCalls, removeCalls, transport } = createTransportMock();

		service.enqueue({
			playlistId: 'p1',
			playlistName: 'Playlist 1',
			toIndex: 3,
			trackId: 't1',
			type: 'move',
		});
		service.enqueue({
			playlistId: 'p1',
			playlistName: 'Playlist 1',
			trackId: 't2',
			type: 'remove',
		});
		service.enqueue({
			playlistId: 'p1',
			playlistName: 'Playlist 1',
			toIndex: 0,
			trackId: 't3',
			type: 'move',
		});

		await service.flush(transport);

		expect(moveCalls).toEqual([
			{ playlistId: 'p1', toIndex: 3, trackId: 't1' },
			{ playlistId: 'p1', toIndex: 0, trackId: 't3' },
		]);
		expect(removeCalls).toEqual([{ playlistId: 'p1', trackId: 't2' }]);
	});

	it('persists ops across service instances using the same store', async () => {
		const store = new InMemoryStore();
		const service1 = new PlaylistEditService(store);

		service1.enqueue({
			playlistId: 'p1',
			playlistName: 'Playlist 1',
			toIndex: 1,
			trackId: 't1',
			type: 'move',
		});

		const emptyTransport = {} as unknown as Transport;
		await service1.flush(emptyTransport);

		// new instance on the same store has no pending ops because flush cleared them
		const service2 = new PlaylistEditService(store);
		const { moveCalls, transport } = createTransportMock();
		await service2.flush(transport);
		expect(moveCalls).toHaveLength(0);
	});

	describe('getPendingCount', () => {
		it('returns 0 when nothing is queued', async () => {
			const store = new InMemoryStore();
			const service = new PlaylistEditService(store);

			expect(await service.getPendingCount()).toBe(0);
		});

		it('counts queued ops before they are flushed', async () => {
			const store = new InMemoryStore();
			const service = new PlaylistEditService(store);

			service.enqueue({
				playlistId: 'p1',
				playlistName: 'Playlist 1',
				toIndex: 1,
				trackId: 't1',
				type: 'move',
			});
			service.enqueue({
				playlistId: 'p1',
				playlistName: 'Playlist 1',
				trackId: 't2',
				type: 'remove',
			});

			expect(await service.getPendingCount()).toBe(2);
		});

		it('returns 0 again after a successful flush', async () => {
			const store = new InMemoryStore();
			const service = new PlaylistEditService(store);
			const { transport } = createTransportMock();

			service.enqueue({
				playlistId: 'p1',
				playlistName: 'Playlist 1',
				toIndex: 0,
				trackId: 't1',
				type: 'move',
			});
			await service.flush(transport);

			expect(await service.getPendingCount()).toBe(0);
		});
	});

	describe('remapPlaylistIds', () => {
		it('replaces local playlist ids with server ids in pending ops', async () => {
			const store = new InMemoryStore();
			const service = new PlaylistEditService(store);

			service.enqueue({
				playlistId: 'local-playlist-1',
				playlistName: 'My Mix',
				trackId: 't1',
				type: 'add',
			});
			service.enqueue({
				playlistId: 'local-playlist-1',
				playlistName: 'My Mix',
				trackId: 't2',
				type: 'add',
			});
			service.enqueue({
				playlistId: 'other-playlist',
				playlistName: 'Other',
				trackId: 't3',
				type: 'remove',
			});

			service.remapPlaylistIds([{ localId: 'local-playlist-1', serverId: 'server-abc' }]);

			const { transport } = createTransportMock();
			const addCalls: Array<{ playlistId: string; trackId: string }> = [];
			const fullTransport = {
				...transport,
				addItemToPlaylist: (playlistId: string, trackId: string) => {
					addCalls.push({ playlistId, trackId });
					return Promise.resolve();
				},
			} as unknown as Transport;

			await service.flush(fullTransport);

			expect(addCalls[0].playlistId).toBe('server-abc');
			expect(addCalls[1].playlistId).toBe('server-abc');
		});

		it('leaves ops with unknown ids unchanged', async () => {
			const store = new InMemoryStore();
			const service = new PlaylistEditService(store);

			service.enqueue({ playlistId: 'unrelated', playlistName: 'X', trackId: 't1', type: 'add' });
			service.remapPlaylistIds([{ localId: 'local-playlist-1', serverId: 'server-abc' }]);

			const addCalls: Array<{ playlistId: string; trackId: string }> = [];
			const transport = {
				addItemToPlaylist: (playlistId: string, trackId: string) => {
					addCalls.push({ playlistId, trackId });
					return Promise.resolve();
				},
			} as unknown as Transport;

			await service.flush(transport);

			expect(addCalls[0].playlistId).toBe('unrelated');
		});

		it('persists the remapped ops to storage', async () => {
			const store = new InMemoryStore();
			const service = new PlaylistEditService(store);

			service.enqueue({
				playlistId: 'local-playlist-1',
				playlistName: 'My Mix',
				trackId: 't1',
				type: 'add',
			});
			service.remapPlaylistIds([{ localId: 'local-playlist-1', serverId: 'server-abc' }]);

			await service.getPendingCount(); // drain the operation chain

			const service2 = new PlaylistEditService(store);
			const addCalls: Array<{ playlistId: string; trackId: string }> = [];
			const transport = {
				addItemToPlaylist: (playlistId: string, trackId: string) => {
					addCalls.push({ playlistId, trackId });
					return Promise.resolve();
				},
			} as unknown as Transport;
			await service2.flush(transport);

			expect(addCalls[0].playlistId).toBe('server-abc');
		});
	});

	describe('collectAddedTrackIds', () => {
		it('returns add-op track ids grouped by the requested local playlist ids', async () => {
			const store = new InMemoryStore();
			const service = new PlaylistEditService(store);

			service.enqueue({ playlistId: 'local-1', playlistName: 'Mix', trackId: 't1', type: 'add' });
			service.enqueue({ playlistId: 'local-1', playlistName: 'Mix', trackId: 't2', type: 'add' });
			service.enqueue({ playlistId: 'local-2', playlistName: 'Other', trackId: 't3', type: 'add' });

			const result = await service.collectAddedTrackIds(['local-1', 'local-2']);

			expect(result.get('local-1')).toEqual(['t1', 't2']);
			expect(result.get('local-2')).toEqual(['t3']);
		});

		it('ignores move and remove ops', async () => {
			const store = new InMemoryStore();
			const service = new PlaylistEditService(store);

			service.enqueue({ playlistId: 'local-1', playlistName: 'Mix', trackId: 't1', type: 'add' });
			service.enqueue({
				playlistId: 'local-1',
				playlistName: 'Mix',
				trackId: 't2',
				type: 'remove',
			});
			service.enqueue({
				playlistId: 'local-1',
				playlistName: 'Mix',
				toIndex: 0,
				trackId: 't1',
				type: 'move',
			});

			const result = await service.collectAddedTrackIds(['local-1']);

			expect(result.get('local-1')).toEqual(['t1']);
		});

		it('returns an empty map when no matching local ids have add ops', async () => {
			const store = new InMemoryStore();
			const service = new PlaylistEditService(store);

			service.enqueue({ playlistId: 'other', playlistName: 'X', trackId: 't1', type: 'add' });

			const result = await service.collectAddedTrackIds(['local-1']);

			expect(result.size).toBe(0);
		});

		it('does not include ops for ids not in the requested list', async () => {
			const store = new InMemoryStore();
			const service = new PlaylistEditService(store);

			service.enqueue({ playlistId: 'local-1', playlistName: 'Mix', trackId: 't1', type: 'add' });
			service.enqueue({ playlistId: 'local-2', playlistName: 'Other', trackId: 't2', type: 'add' });

			const result = await service.collectAddedTrackIds(['local-1']);

			expect(result.has('local-2')).toBe(false);
		});
	});

	it('persists pending ops so a new instance can pick them up before flush', async () => {
		const store = new InMemoryStore();
		const service1 = new PlaylistEditService(store);

		service1.enqueue({
			playlistId: 'p1',
			playlistName: 'Playlist 1',
			toIndex: 1,
			trackId: 't1',
			type: 'move',
		});

		// let the enqueue persistence chain settle
		await new Promise((resolve) => setTimeout(resolve, 0));
		await new Promise((resolve) => setTimeout(resolve, 0));

		const service2 = new PlaylistEditService(store);
		const { moveCalls, transport } = createTransportMock();
		await service2.flush(transport);
		expect(moveCalls).toHaveLength(1);
		expect(moveCalls[0]).toEqual({ playlistId: 'p1', toIndex: 1, trackId: 't1' });
	});
});
