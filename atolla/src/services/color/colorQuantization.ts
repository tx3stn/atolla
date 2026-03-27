import { rgbToHex } from './colorUtils';
import type { Color } from './types';

export interface DominantColorCandidate {
	color: Color;
	population: number;
}

// Quantization step: pixels are snapped to the nearest multiple of STEP in each
// channel before counting, so near-identical shades (e.g. JPEG noise) cluster
// into the same bin rather than fragmenting the histogram.
const STEP = 16;

// Returns up to `count` dominant colours from an RGBA pixel array,
// ordered by pixel count (most frequent first).
// Transparent pixels (alpha < 128) are excluded.
export function extractDominantColors(rgba: Uint8Array, count: number): Array<Color> {
	return extractDominantColorCandidates(rgba, count).map((c) => c.color);
}

export function extractDominantColorCandidates(
	rgba: Uint8Array,
	count: number,
): Array<DominantColorCandidate> {
	if (count < 1) return [];

	const histogram = new Map<number, number>();

	for (let i = 0; i < rgba.length; i += 4) {
		if (rgba[i + 3] < 128) continue;
		const r = Math.floor(rgba[i] / STEP) * STEP;
		const g = Math.floor(rgba[i + 1] / STEP) * STEP;
		const b = Math.floor(rgba[i + 2] / STEP) * STEP;
		const key = (r << 16) | (g << 8) | b;
		histogram.set(key, (histogram.get(key) ?? 0) + 1);
	}

	if (histogram.size === 0) return [];

	return Array.from(histogram.entries())
		.sort((a, b) => b[1] - a[1])
		.slice(0, count)
		.map(([key, population]) => ({
			color: { hex: rgbToHex((key >> 16) & 0xff, (key >> 8) & 0xff, key & 0xff) },
			population,
		}));
}
