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

		service.enqueue({ playlistId: 'p1', toIndex: 2, trackId: 't1', type: 'move' });
		service.enqueue({ playlistId: 'p1', toIndex: 0, trackId: 't2', type: 'move' });

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

		service.enqueue({ playlistId: 'p1', trackId: 't3', type: 'remove' });

		await service.flush(transport);

		expect(removeCalls).toEqual([{ playlistId: 'p1', trackId: 't3' }]);
	});

	it('clears ops after a successful flush', async () => {
		const store = new InMemoryStore();
		const service = new PlaylistEditService(store);
		const { moveCalls, transport } = createTransportMock();

		service.enqueue({ playlistId: 'p1', toIndex: 0, trackId: 't1', type: 'move' });
		await service.flush(transport);
		await service.flush(transport);

		expect(moveCalls).toHaveLength(1);
	});

	it('retains failed ops for next flush', async () => {
		const store = new InMemoryStore();
		const service = new PlaylistEditService(store);

		let callCount = 0;
		const failingTransport = {
			movePlaylistTrack: () => {
				callCount++;
				return Promise.reject(new Error('network error'));
			},
		} as unknown as Transport;

		service.enqueue({ playlistId: 'p1', toIndex: 0, trackId: 't1', type: 'move' });
		await service.flush(failingTransport);

		const { moveCalls, transport } = createTransportMock();
		await service.flush(transport);

		expect(callCount).toBe(1);
		expect(moveCalls).toHaveLength(1);
	});

	it('handles mixed move and remove ops in sequence', async () => {
		const store = new InMemoryStore();
		const service = new PlaylistEditService(store);
		const { moveCalls, removeCalls, transport } = createTransportMock();

		service.enqueue({ playlistId: 'p1', toIndex: 3, trackId: 't1', type: 'move' });
		service.enqueue({ playlistId: 'p1', trackId: 't2', type: 'remove' });
		service.enqueue({ playlistId: 'p1', toIndex: 0, trackId: 't3', type: 'move' });

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

		service1.enqueue({ playlistId: 'p1', toIndex: 1, trackId: 't1', type: 'move' });

		// Wait for enqueue to finish persisting
		const emptyTransport = {} as unknown as Transport;
		await service1.flush(emptyTransport);

		// A new service instance using the same underlying store should have no pending ops
		// because flush cleared them
		const service2 = new PlaylistEditService(store);
		const { moveCalls, transport } = createTransportMock();
		await service2.flush(transport);
		expect(moveCalls).toHaveLength(0);
	});

	it('persists pending ops so a new instance can pick them up before flush', async () => {
		const store = new InMemoryStore();
		const service1 = new PlaylistEditService(store);

		service1.enqueue({ playlistId: 'p1', toIndex: 1, trackId: 't1', type: 'move' });

		// Drain the enqueue promise by awaiting a no-op flush that won't clear (no transport methods)
		// Just wait for the chain to settle by accessing the chain indirectly
		await new Promise((resolve) => setTimeout(resolve, 0));
		await new Promise((resolve) => setTimeout(resolve, 0));

		// Now a new service from the same store should see the pending op
		const service2 = new PlaylistEditService(store);
		const { moveCalls, transport } = createTransportMock();
		await service2.flush(transport);
		expect(moveCalls).toHaveLength(1);
		expect(moveCalls[0]).toEqual({ playlistId: 'p1', toIndex: 1, trackId: 't1' });
	});
});
