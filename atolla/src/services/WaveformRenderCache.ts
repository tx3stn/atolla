import { renderAtollaWaveformFromAmpsAsync } from '../WaveformNative';

const WAVEFORM_WIDTH = 600;
const WAVEFORM_HEIGHT = 35;

export class WaveformRenderCache {
	private cache = new Map<string, string>();
	private pending = new Set<string>();
	private listeners = new Set<() => void>();

	getOrRequest(trackId: string, amps: string): string | null {
		const cached = this.cache.get(trackId);
		if (cached) return cached;

		if (!this.pending.has(trackId)) {
			this.pending.add(trackId);
			renderAtollaWaveformFromAmpsAsync(amps, WAVEFORM_WIDTH, WAVEFORM_HEIGHT, (url) => {
				this.pending.delete(trackId);
				if (url) {
					this.cache.set(trackId, url);
					this.notify();
				}
			});
		}

		return null;
	}

	invalidate(trackId: string): void {
		this.cache.delete(trackId);
		this.pending.delete(trackId);
	}

	clear(): void {
		this.cache.clear();
		this.pending.clear();
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify(): void {
		for (const listener of this.listeners) {
			listener();
		}
	}
}
