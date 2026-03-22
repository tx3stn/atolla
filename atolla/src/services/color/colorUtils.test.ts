import { describe, expect, it } from 'bun:test';
import {
	colorLightness,
	hexToRgb,
	hslToRgb,
	isDark,
	legibleTextColor,
	mutedVariant,
	rgbToHex,
	rgbToHsl,
} from './colorUtils';

describe('hexToRgb', () => {
	it('converts primary colours', () => {
		expect(hexToRgb('#ff0000')).toEqual([255, 0, 0]);
		expect(hexToRgb('#00ff00')).toEqual([0, 255, 0]);
		expect(hexToRgb('#0000ff')).toEqual([0, 0, 255]);
	});

	it('converts black and white', () => {
		expect(hexToRgb('#000000')).toEqual([0, 0, 0]);
		expect(hexToRgb('#ffffff')).toEqual([255, 255, 255]);
	});

	it('strips leading hash', () => {
		expect(hexToRgb('#3b82f6')).toEqual([59, 130, 246]);
	});
});

describe('rgbToHex', () => {
	it('converts primary colours', () => {
		expect(rgbToHex(255, 0, 0)).toBe('#ff0000');
		expect(rgbToHex(0, 255, 0)).toBe('#00ff00');
		expect(rgbToHex(0, 0, 255)).toBe('#0000ff');
	});

	it('rounds fractional values', () => {
		expect(rgbToHex(254.6, 0.4, 0)).toBe('#ff0000');
	});

	it('clamps out-of-range values', () => {
		expect(rgbToHex(300, -10, 0)).toBe('#ff0000');
	});

	it('round-trips with hexToRgb', () => {
		const [r, g, b] = hexToRgb('#3b82f6');
		expect(rgbToHex(r, g, b)).toBe('#3b82f6');
	});
});

describe('rgbToHsl', () => {
	it('pure red is hue 0, full saturation', () => {
		const [h, s, l] = rgbToHsl(255, 0, 0);
		expect(h).toBeCloseTo(0, 1);
		expect(s).toBeCloseTo(1, 2);
		expect(l).toBeCloseTo(0.5, 2);
	});

	it('pure green is hue 120', () => {
		const [h] = rgbToHsl(0, 255, 0);
		expect(h).toBeCloseTo(120, 1);
	});

	it('pure blue is hue 240', () => {
		const [h] = rgbToHsl(0, 0, 255);
		expect(h).toBeCloseTo(240, 1);
	});

	it('white is lightness 1, saturation 0', () => {
		const [, s, l] = rgbToHsl(255, 255, 255);
		expect(s).toBe(0);
		expect(l).toBeCloseTo(1, 2);
	});

	it('black is lightness 0, saturation 0', () => {
		const [, s, l] = rgbToHsl(0, 0, 0);
		expect(s).toBe(0);
		expect(l).toBeCloseTo(0, 2);
	});

	it('mid grey has saturation 0', () => {
		const [, s] = rgbToHsl(128, 128, 128);
		expect(s).toBe(0);
	});
});

describe('hslToRgb', () => {
	it('pure red round-trips', () => {
		const [r, g, b] = hslToRgb(0, 1, 0.5);
		expect(r).toBe(255);
		expect(g).toBe(0);
		expect(b).toBe(0);
	});

	it('white round-trips', () => {
		const [r, g, b] = hslToRgb(0, 0, 1);
		expect(r).toBe(255);
		expect(g).toBe(255);
		expect(b).toBe(255);
	});

	it('black round-trips', () => {
		const [r, g, b] = hslToRgb(0, 0, 0);
		expect(r).toBe(0);
		expect(g).toBe(0);
		expect(b).toBe(0);
	});

	it('round-trips with rgbToHsl for a realistic colour', () => {
		const original: [number, number, number] = [59, 130, 246];
		const [h, s, l] = rgbToHsl(...original);
		const [r, g, b] = hslToRgb(h, s, l);
		expect(r).toBeCloseTo(original[0], -1);
		expect(g).toBeCloseTo(original[1], -1);
		expect(b).toBeCloseTo(original[2], -1);
	});
});

describe('colorLightness', () => {
	it('black has lightness 0', () => {
		expect(colorLightness({ hex: '#000000' })).toBeCloseTo(0, 2);
	});

	it('white has lightness 1', () => {
		expect(colorLightness({ hex: '#ffffff' })).toBeCloseTo(1, 2);
	});

	it('mid grey has lightness ~0.5', () => {
		expect(colorLightness({ hex: '#808080' })).toBeCloseTo(0.502, 2);
	});
});

describe('isDark', () => {
	it('black is dark at default threshold', () => {
		expect(isDark({ hex: '#000000' })).toBe(true);
	});

	it('white is not dark', () => {
		expect(isDark({ hex: '#ffffff' })).toBe(false);
	});

	it('colour just above threshold is not dark', () => {
		// lightness 0.16 > 0.15
		const [r, g, b] = hslToRgb(200, 0.5, 0.16);
		expect(isDark({ hex: rgbToHex(r, g, b) })).toBe(false);
	});

	it('colour at threshold is dark', () => {
		const [r, g, b] = hslToRgb(200, 0.5, 0.15);
		expect(isDark({ hex: rgbToHex(r, g, b) })).toBe(true);
	});

	it('respects a custom threshold', () => {
		expect(isDark({ hex: '#ffffff' }, 1.0)).toBe(true);
		expect(isDark({ hex: '#000000' }, 0.0)).toBe(true);
	});
});

describe('mutedVariant', () => {
	it('reduces saturation', () => {
		const input = { hex: rgbToHex(...hslToRgb(200, 0.8, 0.5)) };
		const muted = mutedVariant(input);
		const [, inputS] = rgbToHsl(...hexToRgb(input.hex));
		const [, mutedS] = rgbToHsl(...hexToRgb(muted.hex));
		expect(mutedS).toBeLessThan(inputS);
	});

	it('reduces lightness', () => {
		const input = { hex: rgbToHex(...hslToRgb(200, 0.8, 0.5)) };
		const muted = mutedVariant(input);
		const [, , inputL] = rgbToHsl(...hexToRgb(input.hex));
		const [, , mutedL] = rgbToHsl(...hexToRgb(muted.hex));
		expect(mutedL).toBeLessThan(inputL);
	});

	it('preserves hue', () => {
		const input = { hex: rgbToHex(...hslToRgb(200, 0.8, 0.5)) };
		const muted = mutedVariant(input);
		const [inputH] = rgbToHsl(...hexToRgb(input.hex));
		const [mutedH] = rgbToHsl(...hexToRgb(muted.hex));
		expect(mutedH).toBeCloseTo(inputH, 0);
	});

	it('floors lightness at 0.08 so it never goes fully black', () => {
		const nearBlack = { hex: rgbToHex(...hslToRgb(200, 0.5, 0.05)) };
		const muted = mutedVariant(nearBlack);
		const [, , l] = rgbToHsl(...hexToRgb(muted.hex));
		expect(l).toBeGreaterThanOrEqual(0.08);
	});
});

describe('legibleTextColor', () => {
	it('returns a light colour over a dark surface', () => {
		const darkSurface = { hex: '#111a2b' };
		const text = legibleTextColor(darkSurface);
		const [, , l] = rgbToHsl(...hexToRgb(text.hex));
		expect(l).toBeGreaterThan(0.5);
	});

	it('returns a dark colour over a light surface', () => {
		const lightSurface = { hex: '#d8dee9' };
		const text = legibleTextColor(lightSurface);
		const [, , l] = rgbToHsl(...hexToRgb(text.hex));
		expect(l).toBeLessThan(0.5);
	});

	it('is not pure white over a dark surface', () => {
		const darkSurface = { hex: '#1a1a2e' };
		const text = legibleTextColor(darkSurface);
		expect(text.hex).not.toBe('#ffffff');
	});

	it('is not pure black over a light surface', () => {
		const lightSurface = { hex: '#e0e8f0' };
		const text = legibleTextColor(lightSurface);
		expect(text.hex).not.toBe('#000000');
	});
});
