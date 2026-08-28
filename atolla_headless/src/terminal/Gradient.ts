export interface Stop {
	hex: string;
	offset: number;
}

export const BELL_STOPS: Array<Stop> = [
	{ hex: '#AA5CC3', offset: 0 },
	{ hex: '#8B62D3', offset: 0.22 },
	{ hex: '#3159BD', offset: 0.5 },
	{ hex: '#2D78CE', offset: 0.76 },
	{ hex: '#57B3E8', offset: 1 },
];

export const TENTACLE_STOPS: Array<Stop> = [
	{ hex: '#0F2A66', offset: 0 },
	{ hex: '#2E62C6', offset: 0.58 },
	{ hex: '#2B8DD8', offset: 0.94 },
	{ hex: '#00A4DC', offset: 1 },
];

export function channels(hex: string): Array<number> {
	const value = Number.parseInt(hex.slice(1), 16);
	return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

export function sample(stops: Array<Stop>, at: number): string {
	const position = Math.min(1, Math.max(0, at));

	let lower = stops[0];
	let upper = stops[stops.length - 1];
	for (let i = 0; i < stops.length - 1; i++) {
		if (position >= stops[i].offset && position <= stops[i + 1].offset) {
			lower = stops[i];
			upper = stops[i + 1];
			break;
		}
	}

	const span = upper.offset - lower.offset;
	const fraction = span === 0 ? 0 : (position - lower.offset) / span;
	const from = channels(lower.hex);
	const to = channels(upper.hex);

	const mixed = from.map((value, i) => Math.round(value + (to[i] - value) * fraction));
	return `#${mixed.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}
