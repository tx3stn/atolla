import type { PaletteStore } from './ArtworkPaletteService';
import type { Palette } from './color/types';
import { DiskWriteWorker } from './DiskWriteWorker';

/**
 * A PaletteStore wrapper that makes writes fire-and-forget so callers
 * (ArtworkPaletteService.persistPalette) are not blocked waiting for disk.
 * Reads delegate synchronously to the inner store — on warm-up, palettes
 * load from disk without blocking subsequent calls.
 */
export class WriteBehindPaletteStore implements PaletteStore {
	private memory = new Map<string, Palette>();
	private pendingWrites = new Map<string, Palette>();
	private writeWorker = new DiskWriteWorker();
	private writeDrainQueued = false;

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
		this.writeWorker.enqueue(async () => {
			this.writeDrainQueued = false;
			await this.drainWrites();
		});
	}

	private async drainWrites(): Promise<void> {
		while (this.pendingWrites.size > 0) {
			const next = this.pendingWrites.entries().next().value;
			if (!next) {
				return;
			}

			const [imageUrl, palette] = next;
			this.pendingWrites.delete(imageUrl);

			try {
				await this.inner.savePalette(imageUrl, palette);
			} catch {
				// Best effort background persistence.
			}
		}
	}
}
