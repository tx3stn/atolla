import { describe, expect, it } from 'bun:test';
import { type WaveformRecord, WaveformService, type WaveformStore } from './WaveformService';

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

			// scheduleGeneration does not persist — only success/failure transitions
			// write to disk, so pending status is in-memory only.
			expect(store.saveCount).toBe(0);
		});

		it('notifies listeners', () => {
			const store = new MockWaveformStore();
			const service = new WaveformService(store);
			let notified = 0;
			service.subscribe(() => {
				notified += 1;
			});

			service.scheduleGeneration('track-1');

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

		it('is a no-op when the record is not pending', () => {
			const store = new MockWaveformStore();
			const service = new WaveformService(store);
			service.scheduleGeneration('track-1');
			service.onGenerationSucceeded('track-1', 'amps-base64-track-1');
			const savesBefore = store.saveCount;

			service.onGenerationSucceeded('track-1', 'amps-base64-other');

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

		it('is a no-op when the record is not pending', () => {
			const store = new MockWaveformStore();
			const service = new WaveformService(store);
			service.scheduleGeneration('track-1');
			service.onGenerationFailed('track-1');
			const savesBefore = store.saveCount;

			service.onGenerationFailed('track-1');

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
});
