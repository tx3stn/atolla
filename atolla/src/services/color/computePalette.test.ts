import { describe, expect, it } from 'bun:test';
import type { DominantColorCandidate } from './colorQuantization';
import { hslToRgb, rgbToHex, rgbToHsl } from './colorUtils';
import { selectPrimary } from './computePalette';
import { NEUTRAL_PALETTE } from './types';

function candidate(hex: string, population: number): DominantColorCandidate {
	return { color: { hex }, population };
}

function hslHex(h: number, s: number, l: number): string {
	return rgbToHex(...hslToRgb(h, s, l));
}

describe('selectPrimary', () => {
	it('returns NEUTRAL_PALETTE primary when candidates is empty', () => {
		expect(selectPrimary([])).toEqual(NEUTRAL_PALETTE.primary);
	});

	it('returns NEUTRAL_PALETTE primary when all candidates have zero population', () => {
		const result = selectPrimary([
			candidate(hslHex(200, 0.6, 0.5), 0),
			candidate(hslHex(30, 0.1, 0.4), 0),
		]);
		expect(result).toEqual(NEUTRAL_PALETTE.primary);
	});

	it('prefers a vibrant minority colour over a grey dominant background', () => {
		// Grey covers 70% of pixels, vivid blue covers 30% — vibrancy weighting should flip the result
		const grey = hslHex(0, 0, 0.5);
		const vividBlue = hslHex(220, 0.75, 0.5);
		const result = selectPrimary([candidate(grey, 700), candidate(vividBlue, 300)]);
		expect(result.hex).toBe(vividBlue);
	});

	it('still picks the most frequent colour when all candidates have equal saturation', () => {
		const blue = hslHex(220, 0.6, 0.5);
		const red = hslHex(0, 0.6, 0.5);
		const result = selectPrimary([candidate(blue, 600), candidate(red, 400)]);
		expect(result.hex).toBe(blue);
	});

	it('skips near-black candidates', () => {
		const nearBlack = hslHex(200, 0.9, 0.03);
		const midBlue = hslHex(220, 0.6, 0.4);
		const result = selectPrimary([candidate(nearBlack, 900), candidate(midBlue, 100)]);
		expect(result.hex).toBe(midBlue);
	});

	it('skips near-white candidates', () => {
		const nearWhite = hslHex(40, 0.5, 0.97);
		const midGreen = hslHex(120, 0.5, 0.45);
		const result = selectPrimary([candidate(nearWhite, 900), candidate(midGreen, 100)]);
		expect(result.hex).toBe(midGreen);
	});

	it('falls back to candidates[0] when all colours are near-black or near-white', () => {
		const nearBlack = hslHex(0, 0, 0.03);
		const nearWhite = hslHex(0, 0, 0.97);
		const result = selectPrimary([candidate(nearBlack, 600), candidate(nearWhite, 400)]);
		expect(result.hex).toBe(nearBlack);
	});

	it('a moderately saturated colour with large share beats a vivid colour with tiny share', () => {
		// 60% share at s=0.45 vs 5% share at s=0.95 — share still matters
		const warmTan = hslHex(35, 0.45, 0.5);
		const vividRed = hslHex(0, 0.95, 0.5);
		const result = selectPrimary([candidate(warmTan, 600), candidate(vividRed, 50)]);
		// warmTan score: 0.923 * (1 + clamp(0.45-0.08,0,1)*2.5) ≈ 0.923 * 1.925 ≈ 1.78
		// vividRed score: 0.077 * (1 + clamp(0.95-0.08,0,1)*2.5) ≈ 0.077 * 3.175 ≈ 0.24
		expect(result.hex).toBe(warmTan);
	});

	it('chosen primary has higher saturation than a grey alternative when vibrancy tips the balance', () => {
		const grey = hslHex(0, 0.02, 0.5);
		const colourful = hslHex(160, 0.55, 0.45);
		const result = selectPrimary([candidate(grey, 550), candidate(colourful, 450)]);
		const [, s] = rgbToHsl(
			...[result.hex].map((h) => {
				const v = Number.parseInt(h.replace('#', ''), 16);
				return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff] as [number, number, number];
			})[0],
		);
		// The colourful candidate should win, so the selected primary's saturation > 0.1
		expect(s).toBeGreaterThan(0.1);
	});
});
