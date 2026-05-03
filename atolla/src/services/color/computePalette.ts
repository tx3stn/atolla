import type { MimeType } from '../../images/MimeType';
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
	mimeType: MimeType,
): Promise<Palette | null> {
	const pixels = await decodePixelSamples(buffer, mimeType);
	if (!pixels) return null;

	const candidates = extractDominantColorCandidates(pixels, 12);
	const primary = selectPrimary(candidates);
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

// Exported for testing.
// Picks the primary colour using a vibrancy-weighted score so that saturated
// colours beat large neutral/grey backgrounds even when they cover fewer pixels.
export function selectPrimary(candidates: Array<DominantColorCandidate>): Color {
	const totalPop = candidates.reduce((sum, c) => sum + c.population, 0);
	if (totalPop === 0) return NEUTRAL_PALETTE.primary;

	let best: { color: Color; score: number } | null = null;
	for (const candidate of candidates) {
		const [r, g, b] = hexToRgb(candidate.color.hex);
		const [, s, l] = rgbToHsl(r, g, b);
		if (l <= 0.05 || l >= 0.95) continue;
		const share = candidate.population / totalPop;
		// Saturated colours score higher than their raw frequency:
		// at s=0.7 the multiplier is ~2.5×, so a vivid 25% colour beats a grey 50% background.
		const vibrancy = 1 + clamp(s - 0.08, 0, 1) * 2.5;
		const score = share * vibrancy;
		if (!best || score > best.score) {
			best = { color: candidate.color, score };
		}
	}
	return best?.color ?? candidates[0]?.color ?? NEUTRAL_PALETTE.primary;
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
		if (share < 0.01 || share > 0.55) continue;

		const hueDistance = normalizedHueDistance(primaryHue, h);
		if (hueDistance < 0.12) continue;

		const lightnessDistance = Math.abs(l - primaryLightness);
		const rarityWeight = clamp(1 - Math.abs(share - 0.12) / 0.12, 0, 1);
		const score =
			(hueDistance * 1.4 + lightnessDistance * 0.35) * (0.15 + s * 1.8) * (0.2 + rarityWeight);
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
