import type { PaletteStore } from './ArtworkPaletteService';
import type { Palette } from './color/types';

/**
 * A PaletteStore wrapper that makes writes fire-and-forget so callers
 * (ArtworkPaletteService.persistPalette) are not blocked waiting for disk.
 * Reads delegate synchronously to the inner store — on warm-up, palettes
 * load from disk without blocking subsequent calls.
 */
export class WriteBehindPaletteStore implements PaletteStore {
	constructor(private inner: PaletteStore) {}

	loadPalette(imageUrl: string): Promise<Palette | null> {
		return this.inner.loadPalette(imageUrl);
	}

	savePalette(imageUrl: string, palette: Palette): Promise<void> {
		void this.inner.savePalette(imageUrl, palette).catch(() => {});
		return Promise.resolve();
	}
}
