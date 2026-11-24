import { describe, expect, it } from 'bun:test';
import { WAVEFORM_MAX_ATTEMPTS, type WaveformFiles, WaveformService } from './WaveformService';

class FakeWaveformFiles implements WaveformFiles {
	cleared = 0;
	stored = new Set<string>();

	clear(): void {
		this.cleared += 1;
		this.stored.clear();
	}

	count(): Promise<number> {
		return Promise.resolve(this.stored.size);
	}

	has(trackId: string): boolean {
		return this.stored.has(trackId);
	}
}

function countNotifications(service: WaveformService): { count: number } {
	const notified = { count: 0 };
	service.subscribe(() => {
		notified.count += 1;
	});
	return notified;
}

describe('WaveformService', () => {
	describe('clearAll', () => {
		it('clears the stored waveforms', () => {
			const files = new FakeWaveformFiles();
			files.stored.add('track-1');
			const service = new WaveformService(files);

			service.clearAll();

			expect(files.cleared).toBe(1);
			expect(service.getStatus('track-1')).toBeNull();
		});

		it('forgets this session pending and failed tracks', () => {
			const service = new WaveformService(new FakeWaveformFiles());
			service.scheduleGeneration('track-1');
			service.scheduleGeneration('track-2');
			service.onGenerationFailed('track-2');

			service.clearAll();

			expect(service.getStatus('track-1')).toBeNull();
			expect(service.getStatus('track-2')).toBeNull();
		});

		it('gives a track that ran out of attempts a fresh set', () => {
			const service = new WaveformService(new FakeWaveformFiles());
			service.scheduleGeneration('track-1');
			for (let i = 0; i < WAVEFORM_MAX_ATTEMPTS; i += 1) {
				service.onGenerationFailed('track-1');
				service.scheduleGeneration('track-1');
			}

			service.clearAll();
			service.scheduleGeneration('track-1');

			expect(service.getStatus('track-1')).toBe('pending');
		});

		it('notifies listeners', () => {
			const service = new WaveformService(new FakeWaveformFiles());
			const notified = countNotifications(service);

			service.clearAll();

			expect(notified.count).toBe(1);
		});
	});

	describe('countStored', () => {
		it('counts the stored waveforms', async () => {
			const files = new FakeWaveformFiles();
			files.stored.add('track-1');
			files.stored.add('track-2');
			const service = new WaveformService(files);

			expect(await service.countStored()).toBe(2);
		});
	});

	describe('getStatus', () => {
		it('is null for a track with no stored waveform', () => {
			const service = new WaveformService(new FakeWaveformFiles());

			expect(service.getStatus('track-1')).toBeNull();
		});

		it('is ready for a stored waveform', () => {
			const files = new FakeWaveformFiles();
			files.stored.add('track-1');
			const service = new WaveformService(files);

			expect(service.getStatus('track-1')).toBe('ready');
		});
	});

	describe('isStored', () => {
		it('reports whether a waveform is stored, whatever the session status', () => {
			const files = new FakeWaveformFiles();
			const service = new WaveformService(files);
			service.scheduleGeneration('track-1');

			expect(service.isStored('track-1')).toBe(false);
			files.stored.add('track-1');
			expect(service.isStored('track-1')).toBe(true);
		});
	});

	describe('onGenerationFailed', () => {
		it('marks a pending track failed', () => {
			const service = new WaveformService(new FakeWaveformFiles());
			service.scheduleGeneration('track-1');

			service.onGenerationFailed('track-1');

			expect(service.getStatus('track-1')).toBe('failed');
		});

		it('is a no-op for a track that is not pending', () => {
			const service = new WaveformService(new FakeWaveformFiles());

			service.onGenerationFailed('track-1');

			expect(service.getStatus('track-1')).toBeNull();
		});

		it('notifies listeners', () => {
			const service = new WaveformService(new FakeWaveformFiles());
			service.scheduleGeneration('track-1');
			const notified = countNotifications(service);

			service.onGenerationFailed('track-1');

			expect(notified.count).toBe(1);
		});
	});

	describe('onGenerationSucceeded', () => {
		it('lets a pending track read as ready once its waveform is stored', () => {
			const files = new FakeWaveformFiles();
			const service = new WaveformService(files);
			service.scheduleGeneration('track-1');
			files.stored.add('track-1');

			service.onGenerationSucceeded('track-1');

			expect(service.getStatus('track-1')).toBe('ready');
		});

		it('is a no-op for a track that is not pending', () => {
			const service = new WaveformService(new FakeWaveformFiles());
			const notified = countNotifications(service);

			service.onGenerationSucceeded('track-1');

			expect(notified.count).toBe(0);
		});

		it('notifies listeners', () => {
			const service = new WaveformService(new FakeWaveformFiles());
			service.scheduleGeneration('track-1');
			const notified = countNotifications(service);

			service.onGenerationSucceeded('track-1');

			expect(notified.count).toBe(1);
		});
	});

	describe('scheduleGeneration', () => {
		it('marks a track with no stored waveform pending', () => {
			const service = new WaveformService(new FakeWaveformFiles());

			service.scheduleGeneration('track-1');

			expect(service.getStatus('track-1')).toBe('pending');
		});

		it('leaves a stored waveform ready', () => {
			const files = new FakeWaveformFiles();
			files.stored.add('track-1');
			const service = new WaveformService(files);

			service.scheduleGeneration('track-1');

			expect(service.getStatus('track-1')).toBe('ready');
		});

		it('does not notify listeners, since a pending track renders identically', () => {
			const service = new WaveformService(new FakeWaveformFiles());
			const notified = countNotifications(service);

			service.scheduleGeneration('track-1');

			expect(notified.count).toBe(0);
		});
	});

	describe('subscribe', () => {
		it('returns an unsubscribe function that stops notifications', () => {
			const service = new WaveformService(new FakeWaveformFiles());
			service.scheduleGeneration('track-1');
			let notified = 0;
			const unsubscribe = service.subscribe(() => {
				notified += 1;
			});

			unsubscribe();
			service.onGenerationSucceeded('track-1');

			expect(notified).toBe(0);
		});
	});

	// a decode can fail transiently (the cache file was evicted or still incomplete when it ran),
	// so a failed record is retryable up to a cap rather than permanently terminal
	describe('failed-track retry', () => {
		it('retries a failed track until it exhausts its attempts, then stays failed', () => {
			const service = new WaveformService(new FakeWaveformFiles());
			service.scheduleGeneration('track-1');

			for (let i = 0; i < WAVEFORM_MAX_ATTEMPTS; i += 1) {
				expect(service.getStatus('track-1')).toBe('pending');
				service.onGenerationFailed('track-1');
				expect(service.getStatus('track-1')).toBe('failed');
				service.scheduleGeneration('track-1');
			}

			expect(service.getStatus('track-1')).toBe('failed');
		});

		it('can still succeed after a failed attempt was retried', () => {
			const files = new FakeWaveformFiles();
			const service = new WaveformService(files);
			service.scheduleGeneration('track-1');
			service.onGenerationFailed('track-1');
			service.scheduleGeneration('track-1');
			files.stored.add('track-1');

			service.onGenerationSucceeded('track-1');

			expect(service.getStatus('track-1')).toBe('ready');
		});
	});
});
