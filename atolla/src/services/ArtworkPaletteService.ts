import { extractDominantColors } from './color/colorQuantization';
import { isDark, legibleTextColor, mutedVariant } from './color/colorUtils';
import { decodePixelSamples } from './color/imageDecoder';
import type { Color, Palette } from './color/types';
import { NEUTRAL_PALETTE } from './color/types';

export interface PaletteStore {
	loadPalette(imageUrl: string): Promise<Palette | null>;
	savePalette(imageUrl: string, palette: Palette): Promise<void>;
}

export interface ArtworkPaletteConfig {
	// Colours with HSL lightness at or below this value are considered too dark
	// to distinguish from the OLED black app background.
	darknessThreshold: number;
}

const DEFAULT_CONFIG: ArtworkPaletteConfig = {
	darknessThreshold: 0.15,
};

export class ArtworkPaletteService {
	private cache = new Map<string, Palette>();
	private listeners = new Set<() => void>();
	lastError: string | null = null;

	constructor(
		private store: PaletteStore,
		private config: ArtworkPaletteConfig = DEFAULT_CONFIG,
	) {}

	// Number of palettes currently held in the in-memory cache.
	get cacheSize(): number {
		return this.cache.size;
	}

	// Returns the extracted palette for the given artwork URL, or NEUTRAL_PALETTE
	// if extraction has not yet completed. Always returns synchronously.
	getPalette(imageUrl: string | null | undefined): Palette {
		if (!imageUrl) return NEUTRAL_PALETTE;
		return this.cache.get(imageUrl) ?? NEUTRAL_PALETTE;
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
					this.cache.set(url, palette);
					this.notify();
				}
			}),
		);
	}

	// Extract a palette from the given image buffer and persist it.
	// Called explicitly (e.g. on button press or when a new track starts).
	async generatePalette(url: string, buffer: ArrayBuffer, mimeType: string): Promise<void> {
		try {
			const pixels = await decodePixelSamples(buffer, mimeType);
			if (!pixels) {
				this.lastError = `decode returned null for ${mimeType} (${url.slice(0, 60)})`;
				this.notify();
				return;
			}

			const candidates = extractDominantColors(pixels, 2);
			const primary = this.selectPrimary(candidates);
			const surface = mutedVariant(primary);
			const palette: Palette = {
				on_surface: legibleTextColor(surface),
				primary,
				surface,
			};

			this.cache.set(url, palette);
			await this.store.savePalette(url, palette);
			this.notify();
		} catch (err) {
			this.lastError = String(err);
			this.notify();
		}
	}

	// Fallback chain: most prominent non-dark colour → second non-dark → neutral white
	private selectPrimary(candidates: Array<Color>): Color {
		for (const color of candidates) {
			if (!isDark(color, this.config.darknessThreshold)) return color;
		}
		return NEUTRAL_PALETTE.primary;
	}

	private notify(): void {
		for (const listener of this.listeners) {
			listener();
		}
	}
}
