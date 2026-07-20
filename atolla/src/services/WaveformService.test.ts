import { describe, expect, it } from 'bun:test';
import {
	WAVEFORM_MAX_ATTEMPTS,
	type WaveformRecord,
	WaveformService,
	type WaveformStore,
} from './WaveformService';

class MockWaveformStore implements WaveformStore {
	private data: Record<string, WaveformRecord> = {};
	saveCount = 0;

	load(): Promise<Record<string, WaveformRecord>> {
		return Promise.resolve({ ...this.data });
	}

	save(records: Record<string, WaveformRecord>): Promise<void> {
		this.data = { ...records };
		this.saveCount += 1;
		return Promise.resolve();
	}

	seed(records: Record<string, WaveformRecord>): void {
		this.data = { ...records };
	}
}

// drain the trailing-edge persist timer so coalesced writes land
function flush(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('WaveformService', () => {
	describe('scheduleGeneration', () => {
		it('creates a pending record for a new track', () => {
			const store = new MockWaveformStore();
			const service = new WaveformService(store);

			service.scheduleGeneration('track-1');

			expect(service.getAmps('track-1')).toBeNull();
		});

		it('is idempotent when a record already exists', () => {
			const store = new MockWaveformStore();
			const service = new WaveformService(store);

			service.scheduleGeneration('track-1');
			service.scheduleGeneration('track-1');

			// scheduleGeneration does not persist; only success/failure transitions write
			// to disk, so pending status is in-memory only
			expect(store.saveCount).toBe(0);
		});

		// a pending record renders identically to no record at all — getAmps returns null for both
		// and getReadyCount ignores it — so notifying only re-renders the overlay to the same output.
		// runWaveformPriority schedules the whole pre-gen window per track advance, so this fires
		// WAVEFORM_PREGEN_WINDOW times a track for no visible change
		it('does not notify listeners, since a pending record renders identically', () => {
			const store = new MockWaveformStore();
			const service = new WaveformService(store);
			let notified = 0;
			service.subscribe(() => {
				notified += 1;
			});

			service.scheduleGeneration('track-1');

			expect(notified).toBe(0);
			expect(service.getAmps('track-1')).toBeNull();
		});

		it('notifies listeners once the generation succeeds', () => {
			const store = new MockWaveformStore();
			const service = new WaveformService(store);
			service.scheduleGeneration('track-1');
			let notified = 0;
			service.subscribe(() => {
				notified += 1;
			});

			service.onGenerationSucceeded('track-1', 'amps-base64-track-1');

			expect(notified).toBe(1);
		});
	});

	describe('onGenerationSucceeded', () => {
		it('marks the record ready and stores the mask url', () => {
			const store = new MockWaveformStore();
			const service = new WaveformService(store);
			service.scheduleGeneration('track-1');

			service.onGenerationSucceeded('track-1', 'amps-base64-track-1');

			expect(service.getAmps('track-1')).toBe('amps-base64-track-1');
		});

		it('is a no-op when the record is not pending', async () => {
			const store = new MockWaveformStore();
			const service = new WaveformService(store);
			service.scheduleGeneration('track-1');
			service.onGenerationSucceeded('track-1', 'amps-base64-track-1');
			await flush();
			const savesBefore = store.saveCount;

			service.onGenerationSucceeded('track-1', 'amps-base64-other');
			await flush();

			expect(service.getAmps('track-1')).toBe('amps-base64-track-1');
			expect(store.saveCount).toBe(savesBefore);
		});

		it('is a no-op for an unknown track', () => {
			const store = new MockWaveformStore();
			const service = new WaveformService(store);

			service.onGenerationSucceeded('unknown', 'amps-base64-unknown');

			expect(service.getAmps('unknown')).toBeNull();
		});

		it('notifies listeners', () => {
			const store = new MockWaveformStore();
			const service = new WaveformService(store);
			service.scheduleGeneration('track-1');
			let notified = 0;
			service.subscribe(() => {
				notified += 1;
			});

			service.onGenerationSucceeded('track-1', 'amps-base64-track-1');

			expect(notified).toBe(1);
		});
	});

	describe('onGenerationFailed', () => {
		it('marks the record failed and returns null url', () => {
			const store = new MockWaveformStore();
			const service = new WaveformService(store);
			service.scheduleGeneration('track-1');

			service.onGenerationFailed('track-1');

			expect(service.getAmps('track-1')).toBeNull();
		});

		it('is a no-op when the record is not pending', async () => {
			const store = new MockWaveformStore();
			const service = new WaveformService(store);
			service.scheduleGeneration('track-1');
			service.onGenerationFailed('track-1');
			await flush();
			const savesBefore = store.saveCount;

			service.onGenerationFailed('track-1');
			await flush();

			expect(store.saveCount).toBe(savesBefore);
		});

		it('is a no-op for an unknown track', () => {
			const store = new MockWaveformStore();
			const service = new WaveformService(store);

			service.onGenerationFailed('unknown');

			expect(store.saveCount).toBe(0);
		});
	});

	describe('removeForTrack', () => {
		it('removes an existing record', () => {
			const store = new MockWaveformStore();
			const service = new WaveformService(store);
			service.scheduleGeneration('track-1');

			service.removeForTrack('track-1');

			expect(service.getAmps('track-1')).toBeNull();
		});

		it('is a no-op when no record exists', () => {
			const store = new MockWaveformStore();
			const service = new WaveformService(store);

			service.removeForTrack('unknown');

			expect(store.saveCount).toBe(0);
		});

		it('allows re-scheduling after removal', () => {
			const store = new MockWaveformStore();
			const service = new WaveformService(store);
			service.scheduleGeneration('track-1');
			service.onGenerationSucceeded('track-1', 'amps-base64-old');
			service.removeForTrack('track-1');

			service.scheduleGeneration('track-1');
			expect(service.getAmps('track-1')).toBeNull();

			service.onGenerationSucceeded('track-1', 'amps-base64-new');
			expect(service.getAmps('track-1')).toBe('amps-base64-new');
		});
	});

	describe('clearAll', () => {
		it('removes all records', () => {
			const store = new MockWaveformStore();
			const service = new WaveformService(store);
			service.scheduleGeneration('track-1');
			service.scheduleGeneration('track-2');
			service.onGenerationSucceeded('track-1', 'amps-base64-track-1');

			service.clearAll();

			expect(service.getAmps('track-1')).toBeNull();
			expect(service.getAmps('track-2')).toBeNull();
		});

		it('is a no-op when already empty', () => {
			const store = new MockWaveformStore();
			const service = new WaveformService(store);

			service.clearAll();

			expect(store.saveCount).toBe(0);
		});

		it('notifies listeners', () => {
			const store = new MockWaveformStore();
			const service = new WaveformService(store);
			service.scheduleGeneration('track-1');
			let notified = 0;
			service.subscribe(() => {
				notified += 1;
			});

			service.clearAll();

			expect(notified).toBe(1);
		});
	});

	describe('getCount', () => {
		it('returns 0 when no records exist', () => {
			const service = new WaveformService(new MockWaveformStore());
			expect(service.getCount()).toBe(0);
		});

		it('counts all records regardless of status', () => {
			const store = new MockWaveformStore();
			const service = new WaveformService(store);
			service.scheduleGeneration('track-1');
			service.scheduleGeneration('track-2');
			service.onGenerationSucceeded('track-1', 'amps-base64-track-1');
			service.scheduleGeneration('track-3');
			service.onGenerationFailed('track-3');

			expect(service.getCount()).toBe(3);
		});

		it('decreases after clearAll', () => {
			const store = new MockWaveformStore();
			const service = new WaveformService(store);
			service.scheduleGeneration('track-1');
			service.scheduleGeneration('track-2');

			service.clearAll();

			expect(service.getCount()).toBe(0);
		});
	});

	describe('getReadyCount', () => {
		it('returns 0 when no records exist', () => {
			const service = new WaveformService(new MockWaveformStore());
			expect(service.getReadyCount()).toBe(0);
		});

		it('counts only ready records', () => {
			const store = new MockWaveformStore();
			const service = new WaveformService(store);
			service.scheduleGeneration('track-1');
			service.scheduleGeneration('track-2');
			service.scheduleGeneration('track-3');
			service.onGenerationSucceeded('track-1', 'amps-base64-track-1');
			service.onGenerationFailed('track-3');

			expect(service.getReadyCount()).toBe(1);
		});

		it('returns 0 after clearAll', () => {
			const store = new MockWaveformStore();
			const service = new WaveformService(store);
			service.scheduleGeneration('track-1');
			service.onGenerationSucceeded('track-1', 'amps-base64-track-1');

			service.clearAll();

			expect(service.getReadyCount()).toBe(0);
		});
	});

	describe('getAmps', () => {
		it('returns null for an unknown track', () => {
			const service = new WaveformService(new MockWaveformStore());
			expect(service.getAmps('unknown')).toBeNull();
		});

		it('returns null for a pending record', () => {
			const store = new MockWaveformStore();
			const service = new WaveformService(store);
			service.scheduleGeneration('track-1');
			expect(service.getAmps('track-1')).toBeNull();
		});

		it('returns null for a failed record', () => {
			const store = new MockWaveformStore();
			const service = new WaveformService(store);
			service.scheduleGeneration('track-1');
			service.onGenerationFailed('track-1');
			expect(service.getAmps('track-1')).toBeNull();
		});

		it('returns the amps for a ready record', () => {
			const store = new MockWaveformStore();
			const service = new WaveformService(store);
			service.scheduleGeneration('track-1');
			service.onGenerationSucceeded('track-1', 'amps-base64-track-1');
			expect(service.getAmps('track-1')).toBe('amps-base64-track-1');
		});
	});

	describe('subscribe', () => {
		it('returns an unsubscribe function that stops notifications', () => {
			const store = new MockWaveformStore();
			const service = new WaveformService(store);
			let notified = 0;
			const unsubscribe = service.subscribe(() => {
				notified += 1;
			});

			unsubscribe();
			service.scheduleGeneration('track-1');

			expect(notified).toBe(0);
		});
	});

	describe('warmUp', () => {
		it('loads persisted records and makes ready amps available', async () => {
			const store = new MockWaveformStore();
			store.seed({
				'track-1': { amps: 'amps-base64-track-1', status: 'ready', trackId: 'track-1' },
				'track-2': { amps: null, status: 'failed', trackId: 'track-2' },
			});
			const service = new WaveformService(store);

			await service.warmUp();

			expect(service.getAmps('track-1')).toBe('amps-base64-track-1');
			expect(service.getAmps('track-2')).toBeNull();
		});

		it('notifies listeners after loading', async () => {
			const store = new MockWaveformStore();
			store.seed({
				'track-1': { amps: 'amps-base64-track-1', status: 'ready', trackId: 'track-1' },
			});
			const service = new WaveformService(store);
			let notified = 0;
			service.subscribe(() => {
				notified += 1;
			});

			await service.warmUp();

			expect(notified).toBe(1);
		});
	});

	// a decode can fail transiently (the cache file was evicted or still incomplete when it ran),
	// so a failed record is retryable up to a cap rather than permanently terminal
	describe('failed-track retry', () => {
		it('retries a failed track until it exhausts its attempts, then stays failed', () => {
			const store = new MockWaveformStore();
			const service = new WaveformService(store);
			service.scheduleGeneration('track-1');

			for (let i = 0; i < WAVEFORM_MAX_ATTEMPTS; i += 1) {
				expect(service.getStatus('track-1')).toBe('pending');
				service.onGenerationFailed('track-1');
				expect(service.getStatus('track-1')).toBe('failed');
				service.scheduleGeneration('track-1');
			}

			expect(service.getStatus('track-1')).toBe('failed');
		});

		it('gives a fresh set of attempts after removeForTrack', () => {
			const store = new MockWaveformStore();
			const service = new WaveformService(store);
			service.scheduleGeneration('track-1');
			for (let i = 0; i < WAVEFORM_MAX_ATTEMPTS; i += 1) {
				service.onGenerationFailed('track-1');
				service.scheduleGeneration('track-1');
			}
			expect(service.getStatus('track-1')).toBe('failed');

			service.removeForTrack('track-1');
			service.scheduleGeneration('track-1');

			expect(service.getStatus('track-1')).toBe('pending');
		});

		it('can still succeed after a failed attempt was retried', () => {
			const store = new MockWaveformStore();
			const service = new WaveformService(store);
			service.scheduleGeneration('track-1');
			service.onGenerationFailed('track-1');
			service.scheduleGeneration('track-1');

			service.onGenerationSucceeded('track-1', 'amps');

			expect(service.getAmps('track-1')).toBe('amps');
		});
	});

	// runWaveformPriority schedules the whole pre-gen window per track advance, so a burst of
	// successes each used to re-stringify every record (amps strings included) to disk
	describe('persist coalescing', () => {
		it('collapses a burst of writes into a single save', async () => {
			const store = new MockWaveformStore();
			const service = new WaveformService(store);
			for (let i = 0; i < 5; i += 1) service.scheduleGeneration(`track-${i}`);

			for (let i = 0; i < 5; i += 1) service.onGenerationSucceeded(`track-${i}`, `amps-${i}`);
			await flush();

			expect(store.saveCount).toBe(1);
		});

		it('persists the final state of every record after coalescing', async () => {
			const store = new MockWaveformStore();
			const service = new WaveformService(store);
			for (let i = 0; i < 5; i += 1) service.scheduleGeneration(`track-${i}`);

			for (let i = 0; i < 5; i += 1) service.onGenerationSucceeded(`track-${i}`, `amps-${i}`);
			await flush();

			const persisted = await store.load();
			expect(Object.keys(persisted).length).toBe(5);
			expect(persisted['track-4']?.amps).toBe('amps-4');
		});

		it('notifies synchronously even though the write is deferred', () => {
			const store = new MockWaveformStore();
			const service = new WaveformService(store);
			service.scheduleGeneration('track-1');
			let notified = 0;
			service.subscribe(() => {
				notified += 1;
			});

			service.onGenerationSucceeded('track-1', 'amps-base64-track-1');

			expect(notified).toBe(1);
			expect(store.saveCount).toBe(0);
		});
	});
});
