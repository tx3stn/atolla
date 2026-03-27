import type { Color } from './types';

export type RGB = readonly [number, number, number];
export type HSL = readonly [number, number, number];

export function hexToRgb(hex: string): RGB {
	const h = hex.replace('#', '');
	return [
		Number.parseInt(h.substring(0, 2), 16),
		Number.parseInt(h.substring(2, 4), 16),
		Number.parseInt(h.substring(4, 6), 16),
	] as const;
}

export function rgbToHex(r: number, g: number, b: number): string {
	return (
		'#' +
		[r, g, b]
			.map((c) =>
				Math.max(0, Math.min(255, Math.round(c)))
					.toString(16)
					.padStart(2, '0'),
			)
			.join('')
	);
}

export function rgbToHsl(r: number, g: number, b: number): HSL {
	const rn = r / 255;
	const gn = g / 255;
	const bn = b / 255;
	const max = Math.max(rn, gn, bn);
	const min = Math.min(rn, gn, bn);
	const l = (max + min) / 2;

	if (max === min) return [0, 0, l] as const;

	const d = max - min;
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

	let h: number;
	if (max === rn) {
		h = (gn - bn) / d + (gn < bn ? 6 : 0);
	} else if (max === gn) {
		h = (bn - rn) / d + 2;
	} else {
		h = (rn - gn) / d + 4;
	}
	h = (h / 6) * 360;

	return [h, s, l] as const;
}

export function hslToRgb(h: number, s: number, l: number): RGB {
	if (s === 0) {
		const v = Math.round(l * 255);
		return [v, v, v] as const;
	}

	const hk = h / 360;
	const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
	const p = 2 * l - q;

	const hue2rgb = (pp: number, qq: number, t: number): number => {
		let tt = t;
		if (tt < 0) tt += 1;
		if (tt > 1) tt -= 1;
		if (tt < 1 / 6) return pp + (qq - pp) * 6 * tt;
		if (tt < 1 / 2) return qq;
		if (tt < 2 / 3) return pp + (qq - pp) * (2 / 3 - tt) * 6;
		return pp;
	};

	return [
		Math.round(hue2rgb(p, q, hk + 1 / 3) * 255),
		Math.round(hue2rgb(p, q, hk) * 255),
		Math.round(hue2rgb(p, q, hk - 1 / 3) * 255),
	] as const;
}

export function colorLightness(color: Color): number {
	const [r, g, b] = hexToRgb(color.hex);
	const [, , l] = rgbToHsl(r, g, b);
	return l;
}

export function isDark(color: Color, threshold = 0.15): boolean {
	return colorLightness(color) <= threshold;
}

// Returns a gently softened variant suitable as a background surface —
// slightly darker and slightly less saturated than the raw primary.
export function mutedVariant(color: Color): Color {
	const [r, g, b] = hexToRgb(color.hex);
	const [h, s, l] = rgbToHsl(r, g, b);
	const newL = Math.max(l * 0.82, 0.08);

	const isNearNeutral = s < 0.18;
	if (isNearNeutral) {
		const grey = Math.round(newL * 255);
		return { hex: rgbToHex(grey, grey, grey) };
	}

	// Light/pastel colours have deceptively high HSL saturation, so scale down
	// more aggressively to avoid cream→yellow or blush→pink shifts.
	const newS = l > 0.65 ? s * 0.45 : Math.max(s * 0.85, 0.2);
	const [nr, ng, nb] = hslToRgb(h, newS, newL);
	return { hex: rgbToHex(nr, ng, nb) };
}

// Returns a text color that is legible over the given surface while remaining
// tastefully tinted — avoids pure white/black unless necessary.
export function legibleTextColor(surface: Color): Color {
	const [r, g, b] = hexToRgb(surface.hex);
	const [h, s, l] = rgbToHsl(r, g, b);
	if (l < 0.5) {
		// Dark surface: light text, gently tinted with the surface hue
		const textL = Math.min(0.88, l + 0.65);
		const textS = Math.min(s * 1.5, 0.35);
		const [nr, ng, nb] = hslToRgb(h, textS, textL);
		return { hex: rgbToHex(nr, ng, nb) };
	} else {
		// Light surface: dark text
		const textL = Math.max(0.12, l - 0.6);
		const textS = Math.min(s * 0.8, 0.45);
		const [nr, ng, nb] = hslToRgb(h, textS, textL);
		return { hex: rgbToHex(nr, ng, nb) };
	}
}

// Returns a softer variant of on-surface text by blending toward the surface.
// Useful for secondary metadata text while staying in the same palette family.
export function mutedTextColor(onSurface: Color, surface: Color): Color {
	const [tr, tg, tb] = hexToRgb(onSurface.hex);
	const [sr, sg, sb] = hexToRgb(surface.hex);
	const factor = 0.22;
	const mix = (text: number, base: number) => text + (base - text) * factor;
	return {
		hex: rgbToHex(mix(tr, sr), mix(tg, sg), mix(tb, sb)),
	};
}
