import type { MimeType } from '../images/MimeType';
import { mutedTextColor } from './color/colorUtils';
import { computePalette } from './color/computePalette';
import type { Palette } from './color/types';
import { NEUTRAL_PALETTE } from './color/types';

export interface PaletteStore {
	clearAll(): Promise<void>;
	loadPalette(imageUrl: string): Promise<Palette | null>;
	savePalette(imageUrl: string, palette: Palette): Promise<void>;
}

export class ArtworkPaletteService {
	private cache = new Map<string, Palette>();
	private listeners = new Set<() => void>();
	lastError: string | null = null;

	constructor(private store: PaletteStore) {}

	// Number of palettes currently held in the in-memory cache.
	get cacheSize(): number {
		return this.cache.size;
	}

	// Returns the extracted palette for the given artwork URL, or NEUTRAL_PALETTE
	// if extraction has not yet completed. Always returns synchronously.
	getPalette(imageUrl: string | null | undefined): Palette {
		if (!imageUrl) return NEUTRAL_PALETTE;
		const cached = this.cache.get(imageUrl);
		if (!cached) return NEUTRAL_PALETTE;
		return this.normalizePalette(cached);
	}

	hasPalette(imageUrl: string | null | undefined): boolean {
		if (!imageUrl) return false;
		return this.cache.has(imageUrl);
	}

	// Subscribe to palette updates. Returns an unsubscribe function.
	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	// Load persisted palettes for the given artwork URLs (call on startup).
	async warmUp(imageUrls: Array<string>): Promise<void> {
		await Promise.all(
			imageUrls.map(async (url) => {
				if (this.cache.has(url)) return;
				const palette = await this.store.loadPalette(url);
				if (palette) {
					this.cache.set(url, this.normalizePalette(palette));
				}
			}),
		);
		this.notify();
	}

	// Extract a palette from the given image buffer and persist it.
	async generatePalette(url: string, buffer: ArrayBuffer, mimeType: MimeType): Promise<void> {
		try {
			const palette = await computePalette(buffer, mimeType);
			if (!palette) {
				this.lastError = `decode returned null for ${mimeType} (${url.slice(0, 60)})`;
				this.notify();
				return;
			}
			await this.persistPalette(url, palette);
		} catch (err) {
			this.lastError = String(err);
			this.notify();
		}
	}

	async clearAll(): Promise<void> {
		this.cache.clear();
		await this.store.clearAll();
		this.notify();
	}

	async persistPalette(url: string, palette: Palette): Promise<void> {
		const normalized = this.normalizePalette(palette);
		this.cache.set(url, normalized);
		await this.store.savePalette(url, normalized);
		this.notify();
	}

	private notify(): void {
		for (const listener of this.listeners) {
			listener();
		}
	}

	private normalizePalette(palette: Palette): Palette {
		const accentHex = palette.accent?.hex ?? palette.primary.hex;
		const mutedOnSurfaceHex =
			palette.muted_on_surface?.hex ?? mutedTextColor(palette.on_surface, palette.surface).hex;
		return {
			...palette,
			accent: { hex: accentHex },
			muted_on_surface: { hex: mutedOnSurfaceHex },
		};
	}
}
