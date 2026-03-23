import {
	type DominantColorCandidate,
	extractDominantColorCandidates,
} from './color/colorQuantization';
import {
	hexToRgb,
	hslToRgb,
	isDark,
	legibleTextColor,
	mutedTextColor,
	mutedVariant,
	rgbToHex,
	rgbToHsl,
} from './color/colorUtils';
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

			const candidates = extractDominantColorCandidates(pixels, 8);
			const primary = this.selectPrimary(candidates);
			const accent = this.selectAccent(candidates, primary);
			const surface = mutedVariant(primary);
			const onSurface = legibleTextColor(surface);
			const palette: Palette = {
				accent,
				muted_on_surface: mutedTextColor(onSurface, surface),
				on_surface: onSurface,
				primary,
				surface,
			};
			await this.persistPalette(url, palette);
		} catch (err) {
			this.lastError = String(err);
			this.notify();
		}
	}

	async persistPalette(url: string, palette: Palette): Promise<void> {
		const normalized = this.normalizePalette(palette);
		this.cache.set(url, normalized);
		await this.store.savePalette(url, normalized);
		this.notify();
	}

	// Fallback chain: most prominent non-dark colour → second non-dark → neutral white
	private selectPrimary(candidates: Array<DominantColorCandidate>): Color {
		let best: { color: Color; score: number } | null = null;
		for (const candidate of candidates) {
			if (isDark(candidate.color, this.config.darknessThreshold)) continue;

			const score = this.candidateScore(candidate);
			if (!best || score > best.score) {
				best = { color: candidate.color, score };
			}
		}

		if (best) {
			return this.enhancePrimary(best.color);
		}

		for (const candidate of candidates) {
			if (!isDark(candidate.color, this.config.darknessThreshold)) return candidate.color;
		}
		return NEUTRAL_PALETTE.primary;
	}

	private candidateScore(candidate: DominantColorCandidate): number {
		const [r, g, b] = hexToRgb(candidate.color.hex);
		const [, s, l] = rgbToHsl(r, g, b);
		const saturationWeight = 0.45 + s * 1.15;
		const lightnessDistance = Math.abs(l - 0.55);
		const lightnessWeight = clamp(1 - lightnessDistance * 1.7, 0.35, 1);
		const neutralPenalty = s < 0.12 ? 0.55 : 1;
		return candidate.population * saturationWeight * lightnessWeight * neutralPenalty;
	}

	private enhancePrimary(color: Color): Color {
		const [r, g, b] = hexToRgb(color.hex);
		const [h, s, l] = rgbToHsl(r, g, b);
		if (s < 0.08) return color;

		const boostedSaturation = clamp(Math.max(s, 0.28) * 1.05, 0, 0.92);
		const clampedLightness = clamp(l, 0.2, 0.78);
		const [nr, ng, nb] = hslToRgb(h, boostedSaturation, clampedLightness);
		return { hex: rgbToHex(nr, ng, nb) };
	}

	private selectAccent(candidates: Array<DominantColorCandidate>, primary: Color): Color {
		const totalPopulation = candidates.reduce((sum, item) => sum + item.population, 0);
		if (totalPopulation <= 0) return primary;

		const [pr, pg, pb] = hexToRgb(primary.hex);
		const [primaryHue, , primaryLightness] = rgbToHsl(pr, pg, pb);

		let best: { color: Color; score: number } | null = null;
		for (const candidate of candidates) {
			const [r, g, b] = hexToRgb(candidate.color.hex);
			const [h, s, l] = rgbToHsl(r, g, b);
			if (l <= this.config.darknessThreshold || l >= 0.88) continue;
			if (s < 0.2) continue;

			const share = candidate.population / totalPopulation;
			if (share < 0.01 || share > 0.35) continue;

			const hueDistance = normalizedHueDistance(primaryHue, h);
			if (hueDistance < 0.12) continue;

			const lightnessDistance = Math.abs(l - primaryLightness);
			const rarityWeight = clamp(1 - Math.abs(share - 0.12) / 0.12, 0, 1);
			const score =
				(hueDistance * 1.4 + lightnessDistance * 0.35) * (0.35 + s) * (0.2 + rarityWeight);
			if (!best || score > best.score) {
				best = { color: candidate.color, score };
			}
		}

		if (!best) return primary;
		return this.enhanceAccent(best.color);
	}

	private enhanceAccent(color: Color): Color {
		const [r, g, b] = hexToRgb(color.hex);
		const [h, s, l] = rgbToHsl(r, g, b);
		const boostedSaturation = clamp(Math.max(s, 0.34) * 1.08, 0, 0.95);
		const clampedLightness = clamp(l, 0.24, 0.74);
		const [nr, ng, nb] = hslToRgb(h, boostedSaturation, clampedLightness);
		return { hex: rgbToHex(nr, ng, nb) };
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

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function normalizedHueDistance(a: number, b: number): number {
	const delta = Math.abs(a - b);
	return Math.min(delta, 360 - delta) / 180;
}
