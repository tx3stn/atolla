import { type DominantColorCandidate, extractDominantColorCandidates } from './colorQuantization';
import {
	applyHueTint,
	hexToRgb,
	hslToRgb,
	legibleTextColor,
	mutedTextColor,
	mutedVariant,
	rgbToHex,
	rgbToHsl,
} from './colorUtils';
import { decodePixelSamples } from './imageDecoder';
import type { Color, Palette } from './types';
import { NEUTRAL_PALETTE } from './types';

// Pure computation: decode image pixels and extract a colour palette.
// Returns null if the image could not be decoded.
export async function computePalette(
	buffer: ArrayBuffer,
	mimeType: string,
): Promise<Palette | null> {
	const pixels = await decodePixelSamples(buffer, mimeType);
	if (!pixels) return null;

	const candidates = extractDominantColorCandidates(pixels, 8);
	const primary = candidates[0]?.color ?? NEUTRAL_PALETTE.primary;
	const tint = selectTint(candidates, primary);
	const accent = selectAccent(candidates, primary);
	const rawSurface = mutedVariant(primary);
	const surface = tint ? applyHueTint(rawSurface, tint) : rawSurface;
	const onSurface = legibleTextColor(surface);
	return {
		accent: enhanceAccent(accent),
		muted_on_surface: mutedTextColor(onSurface, surface),
		on_surface: onSurface,
		primary,
		surface,
	};
}

function selectTint(candidates: Array<DominantColorCandidate>, primary: Color): Color | null {
	const [pr, pg, pb] = hexToRgb(primary.hex);
	const [, primaryS] = rgbToHsl(pr, pg, pb);
	if (primaryS >= 0.18) return null;

	let best: { color: Color; saturation: number } | null = null;
	for (const candidate of candidates) {
		const [r, g, b] = hexToRgb(candidate.color.hex);
		const [, s, l] = rgbToHsl(r, g, b);
		if (s < 0.2 || l <= 0.12 || l >= 0.92) continue;
		if (!best || s > best.saturation) {
			best = { color: candidate.color, saturation: s };
		}
	}
	return best?.color ?? null;
}

function selectAccent(candidates: Array<DominantColorCandidate>, primary: Color): Color {
	const totalPopulation = candidates.reduce((sum, item) => sum + item.population, 0);
	if (totalPopulation <= 0) return primary;

	const [pr, pg, pb] = hexToRgb(primary.hex);
	const [primaryHue, , primaryLightness] = rgbToHsl(pr, pg, pb);

	let best: { color: Color; score: number } | null = null;
	for (const candidate of candidates) {
		const [r, g, b] = hexToRgb(candidate.color.hex);
		const [h, s, l] = rgbToHsl(r, g, b);
		if (l <= 0.15 || l >= 0.88) continue;
		if (s < 0.25) continue;

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
	return enhanceAccent(best.color);
}

function enhanceAccent(color: Color): Color {
	const [r, g, b] = hexToRgb(color.hex);
	const [h, s, l] = rgbToHsl(r, g, b);
	const boostedSaturation = clamp(Math.max(s, 0.34) * 1.08, 0, 0.95);
	const clampedLightness = clamp(l, 0.24, 0.74);
	const [nr, ng, nb] = hslToRgb(h, boostedSaturation, clampedLightness);
	return { hex: rgbToHex(nr, ng, nb) };
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function normalizedHueDistance(a: number, b: number): number {
	const delta = Math.abs(a - b);
	return Math.min(delta, 360 - delta) / 180;
}
