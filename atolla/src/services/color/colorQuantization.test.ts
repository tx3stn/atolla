import { describe, expect, it } from 'bun:test';
import { extractDominantColors } from './colorQuantization';

// Build a flat RGBA Uint8Array from an array of [r,g,b] triples (alpha=255)
function rgba(...pixels: Array<[number, number, number]>): Uint8Array {
	const out = new Uint8Array(pixels.length * 4);
	for (let i = 0; i < pixels.length; i++) {
		out[i * 4] = pixels[i][0];
		out[i * 4 + 1] = pixels[i][1];
		out[i * 4 + 2] = pixels[i][2];
		out[i * 4 + 3] = 255;
	}
	return out;
}

// Build a flat RGBA array where N copies of each colour are provided
function rgbaMany(entries: Array<{ color: [number, number, number]; count: number }>): Uint8Array {
	const pixels: Array<[number, number, number]> = [];
	for (const { color, count } of entries) {
		for (let i = 0; i < count; i++) pixels.push(color);
	}
	return rgba(...pixels);
}

describe('extractDominantColors', () => {
	it('returns a single colour for a uniform image', () => {
		const data = rgba(...Array(100).fill([200, 100, 50] as [number, number, number]));
		const colors = extractDominantColors(data, 2);
		expect(colors.length).toBeGreaterThanOrEqual(1);
		expect(colors[0].hex).toBe('#c86432');
	});

	it('returns two distinct colours for a two-colour image', () => {
		const data = rgbaMany([
			{ color: [255, 0, 0], count: 50 },
			{ color: [0, 0, 255], count: 50 },
		]);
		const colors = extractDominantColors(data, 2);
		expect(colors.length).toBe(2);
		const hexes = colors.map((c) => c.hex);
		// Both red-ish and blue-ish should appear
		expect(hexes.some((h) => Number.parseInt(h.slice(1, 3), 16) > 150)).toBe(true); // red dominant
		expect(hexes.some((h) => Number.parseInt(h.slice(5, 7), 16) > 150)).toBe(true); // blue dominant
	});

	it('sorts by prominence — largest region comes first', () => {
		const data = rgbaMany([
			{ color: [255, 0, 0], count: 80 }, // dominant
			{ color: [0, 0, 255], count: 20 }, // secondary
		]);
		const colors = extractDominantColors(data, 2);
		// The red bucket (80 pixels) should beat the blue bucket (20 pixels)
		const topR = Number.parseInt(colors[0].hex.slice(1, 3), 16);
		expect(topR).toBeGreaterThan(150);
	});

	it('caps output at requested count even if more regions exist', () => {
		const data = rgbaMany([
			{ color: [255, 0, 0], count: 30 },
			{ color: [0, 255, 0], count: 30 },
			{ color: [0, 0, 255], count: 30 },
			{ color: [255, 255, 0], count: 30 },
		]);
		expect(extractDominantColors(data, 2).length).toBe(2);
	});

	it('skips transparent pixels (alpha < 128)', () => {
		const allTransparent = new Uint8Array([255, 0, 0, 0, 0, 255, 0, 0]); // alpha=0
		expect(extractDominantColors(allTransparent, 2)).toEqual([]);
	});

	it('includes semi-transparent pixels (alpha >= 128)', () => {
		const data = new Uint8Array([200, 100, 50, 128]); // alpha=128
		const colors = extractDominantColors(data, 1);
		expect(colors.length).toBe(1);
	});

	it('returns empty array for empty input', () => {
		expect(extractDominantColors(new Uint8Array(0), 2)).toEqual([]);
	});

	it('returns empty array when count is 0', () => {
		const data = rgba([255, 0, 0]);
		expect(extractDominantColors(data, 0)).toEqual([]);
	});

	it('handles single pixel image', () => {
		const data = rgba([123, 45, 67]);
		const colors = extractDominantColors(data, 3);
		expect(colors.length).toBe(1);
		expect(colors[0].hex).toBe('#7b2d43');
	});
});
