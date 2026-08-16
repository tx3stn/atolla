import type { Palette } from '../models/Color';
import type { PaletteStorage } from '../stores/PaletteStore';

// imageUrl identifies the artwork whose palette changed, so listeners can ignore palettes they are
// not displaying. bulk changes (warm-up, clear) pass nothing and must be treated as relevant
export type PaletteListener = (imageUrl?: string) => void;

export class ArtworkPaletteService {
	private cache = new Map<string, Palette>();
	private listeners = new Set<PaletteListener>();
	lastError: string | null = null;

	constructor(private store: PaletteStorage) {}

	get cacheSize(): number {
		return this.cache.size;
	}

	// palette for an artwork URL, or undefined if extraction hasn't finished; always sync
	getPalette(imageUrl: string | null | undefined): Palette | undefined {
		if (!imageUrl) return undefined;
		return this.cache.get(imageUrl);
	}

	hasPalette(imageUrl: string | null | undefined): boolean {
		if (!imageUrl) return false;
		return this.cache.has(imageUrl);
	}

	subscribe(listener: PaletteListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	async warmUp(imageUrls: Array<string>): Promise<void> {
		let loaded = false;
		await Promise.all(
			imageUrls.map(async (url) => {
				if (this.cache.has(url)) return;
				const palette = await this.store.loadPalette(url);
				if (palette) {
					this.cache.set(url, this.normalizePalette(palette));
					loaded = true;
				}
			}),
		);
		if (loaded) {
			this.notify();
		}
	}

	async clearAll(): Promise<void> {
		const hadPalettes = this.cache.size > 0;
		this.cache.clear();
		await this.store.clearAll();
		if (hadPalettes) {
			this.notify();
		}
	}

	persistPalette(url: string, palette: Palette): void {
		const normalized = this.normalizePalette(palette);
		this.cache.set(url, normalized);
		void this.store.savePalette(url, normalized);
		this.notify(url);
	}

	private notify(imageUrl?: string): void {
		for (const listener of this.listeners) {
			listener(imageUrl);
		}
	}

	private normalizePalette(palette: Palette): Palette {
		return {
			...palette,
			accent: { hex: palette.accent?.hex ?? palette.surface.hex },
			muted_on_surface: { hex: palette.muted_on_surface?.hex ?? palette.on_surface.hex },
		};
	}
}
