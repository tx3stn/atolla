import type { PaletteStore } from './ArtworkPaletteService';
import type { Palette } from './color/types';

/**
 * A PaletteStore wrapper that makes writes fire-and-forget so callers
 * (ArtworkPaletteService.persistPalette) are not blocked waiting for disk.
 * Reads delegate synchronously to the inner store — on warm-up, palettes
 * load from disk without blocking subsequent calls.
 */
export class WriteBehindPaletteStore implements PaletteStore {
	private memory = new Map<string, Palette>();
	private pendingWrites = new Map<string, Palette>();
	private writeQueue: Array<() => Promise<void>> = [];
	private writeQueueRunning = false;
	private writeDrainQueued = false;
	private clearGeneration = 0;

	constructor(private inner: PaletteStore) {}

	async loadPalette(imageUrl: string): Promise<Palette | null> {
		const cached = this.memory.get(imageUrl);
		if (cached) {
			return cached;
		}

		const loaded = await this.inner.loadPalette(imageUrl);
		if (loaded) {
			this.memory.set(imageUrl, loaded);
		}
		return loaded;
	}

	async clearAll(): Promise<void> {
		this.clearGeneration += 1;
		this.memory.clear();
		this.pendingWrites.clear();
		await this.inner.clearAll();
	}

	savePalette(imageUrl: string, palette: Palette): Promise<void> {
		this.memory.set(imageUrl, palette);
		this.pendingWrites.set(imageUrl, palette);
		this.queueDrainWrites();
		return Promise.resolve();
	}

	private queueDrainWrites(): void {
		if (this.writeDrainQueued) {
			return;
		}
		this.writeDrainQueued = true;
		this.enqueueWriteJob(async () => {
			this.writeDrainQueued = false;
			await this.drainWrites();
		});
	}

	private enqueueWriteJob(job: () => Promise<void>): void {
		this.writeQueue.push(job);
		if (this.writeQueueRunning) {
			return;
		}
		this.writeQueueRunning = true;
		void this.runWriteQueue();
	}

	private async runWriteQueue(): Promise<void> {
		while (this.writeQueue.length > 0) {
			const job = this.writeQueue.shift();
			if (!job) {
				continue;
			}

			try {
				await job();
			} catch {
				// Best effort background writes.
			}

			await new Promise<void>((resolve) => {
				setTimeout(resolve, 0);
			});
		}

		this.writeQueueRunning = false;
		if (this.writeQueue.length > 0) {
			this.writeQueueRunning = true;
			void this.runWriteQueue();
		}
	}

	private async drainWrites(): Promise<void> {
		while (this.pendingWrites.size > 0) {
			const next = this.pendingWrites.entries().next().value;
			if (!next) {
				return;
			}

			const [imageUrl, palette] = next;
			this.pendingWrites.delete(imageUrl);

			const generation = this.clearGeneration;
			try {
				await this.inner.savePalette(imageUrl, palette);
			} catch {
				// Best effort background persistence.
			}
			if (generation !== this.clearGeneration) {
				return;
			}
		}
	}
}
