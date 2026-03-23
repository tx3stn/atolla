import { rgbToHex } from './colorUtils';
import type { Color } from './types';

export interface DominantColorCandidate {
	color: Color;
	population: number;
}

// Returns up to `count` dominant colours from an RGBA pixel array,
// ordered by the size of the colour region they represent (most prominent first).
// Transparent pixels (alpha < 128) are excluded.
export function extractDominantColors(rgba: Uint8Array, count: number): Array<Color> {
	return extractDominantColorCandidates(rgba, count).map((candidate) => candidate.color);
}

export function extractDominantColorCandidates(
	rgba: Uint8Array,
	count: number,
): Array<DominantColorCandidate> {
	if (count < 1) return [];

	// Collect opaque pixels as [r, g, b] tuples
	const pixels: Array<[number, number, number]> = [];
	for (let i = 0; i < rgba.length; i += 4) {
		if (rgba[i + 3] >= 128) pixels.push([rgba[i], rgba[i + 1], rgba[i + 2]]);
	}
	if (pixels.length === 0) return [];

	// Median cut: iteratively split the largest bucket
	const buckets: Array<Array<[number, number, number]>> = [pixels];

	while (buckets.length < count) {
		let splitIdx = -1;
		let maxRange = -1;
		for (let i = 0; i < buckets.length; i++) {
			const range = bucketRange(buckets[i]);
			if (range > maxRange) {
				maxRange = range;
				splitIdx = i;
			}
		}
		if (maxRange === 0) break; // all remaining buckets are uniform

		const [b1, b2] = splitBucket(buckets[splitIdx]);
		buckets.splice(splitIdx, 1, b1, b2);
	}

	// Average each bucket → dominant colour, sort by bucket size (largest first)
	return buckets
		.sort((a, b) => b.length - a.length)
		.map((bucket) => ({
			color: { hex: rgbToHex(...averageColor(bucket)) },
			population: bucket.length,
		}));
}

function bucketRange(bucket: Array<[number, number, number]>): number {
	let rMin = 255,
		rMax = 0,
		gMin = 255,
		gMax = 0,
		bMin = 255,
		bMax = 0;
	for (const [r, g, b] of bucket) {
		if (r < rMin) rMin = r;
		if (r > rMax) rMax = r;
		if (g < gMin) gMin = g;
		if (g > gMax) gMax = g;
		if (b < bMin) bMin = b;
		if (b > bMax) bMax = b;
	}
	return Math.max(rMax - rMin, gMax - gMin, bMax - bMin);
}

function splitBucket(
	bucket: Array<[number, number, number]>,
): [Array<[number, number, number]>, Array<[number, number, number]>] {
	// Find the channel with the greatest range and sort along it
	let rMin = 255,
		rMax = 0,
		gMin = 255,
		gMax = 0,
		bMin = 255,
		bMax = 0;
	for (const [r, g, b] of bucket) {
		if (r < rMin) rMin = r;
		if (r > rMax) rMax = r;
		if (g < gMin) gMin = g;
		if (g > gMax) gMax = g;
		if (b < bMin) bMin = b;
		if (b > bMax) bMax = b;
	}
	const rRange = rMax - rMin;
	const gRange = gMax - gMin;
	const bRange = bMax - bMin;

	let channel: 0 | 1 | 2 = 0;
	if (gRange >= rRange && gRange >= bRange) channel = 1;
	else if (bRange >= rRange) channel = 2;

	const sorted = [...bucket].sort((a, b) => a[channel] - b[channel]);
	const mid = Math.floor(sorted.length / 2);
	return [sorted.slice(0, mid), sorted.slice(mid)];
}

function averageColor(bucket: Array<[number, number, number]>): [number, number, number] {
	let r = 0,
		g = 0,
		b = 0,
		totalWeight = 0;
	for (const [pr, pg, pb] of bucket) {
		const max = Math.max(pr, pg, pb);
		const min = Math.min(pr, pg, pb);
		const saturation = max === 0 ? 0 : (max - min) / max;
		const weight = 1 + saturation * 0.75;
		r += pr * weight;
		g += pg * weight;
		b += pb * weight;
		totalWeight += weight;
	}
	if (totalWeight <= 0) return [0, 0, 0];
	return [Math.round(r / totalWeight), Math.round(g / totalWeight), Math.round(b / totalWeight)];
}
