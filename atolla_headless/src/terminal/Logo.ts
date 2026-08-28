import { BELL_STOPS, sample, TENTACLE_STOPS } from './Gradient';
import type { Terminal } from './Terminal';

export const LOGO_WIDTH = 34;

const BELL: Array<string> = [
	'         ▗▄▄▟████████▙▄▄▖',
	'      ▄▟██████████████████▙▄',
	'    ▄███████████▌████████████▄',
	'  ▗█████████████▘▐█████████████▖',
	' ▟██████████▜███ ▝███▜██████████▙',
	'▗██████████▘ ██▌▐ ▜█▛ ▜██████████▖',
	'▟█████████▌▗▌▐█ ▟▌▐█ ▄ ▜█████████▙',
	'███████   ▗██ █ █▙ ▘▗█▙   ▐███████',
	'▜████████████▌ ▐██▖ █████████████▛',
	' ▜████████████▖███▌▟████████████▛',
	'  ▝▀██████████████████████████▀▘',
	'      ██▀▀▜████████████▛▀▀██',
];

const TENTACLES: Array<string> = [
	'      █▙    ▐█▖     █▌    ▟█',
	'      ▐█     █▌    ▐█     █▌',
	'     ▗█▘    ▟▛▘    ▝▜▙    ▀█▌',
	'      ▜▙▖   ▜▙▖    ▗▟▛   ▗▟█▘',
	'       ▀█    ▀▜▙  ▟█▀   █▛▀',
];

export const BELL_ROWS = BELL.length;

const BELL_GRADIENT_TOP = 84;
const BELL_GRADIENT_BOTTOM = 914;
const BELL_TOP = 164;
const BELL_BOTTOM = 562;

export function logoLines(terminal: Terminal): Array<string> {
	const bell = BELL.map((row, i) =>
		paint(terminal, row, sample(BELL_STOPS, bellPosition((i + 0.5) / BELL.length))),
	);

	const tentacles = TENTACLES.map((row, i) =>
		paint(terminal, row, sample(TENTACLE_STOPS, (i + 0.5) / TENTACLES.length)),
	);

	return [...bell, ...tentacles];
}

function bellPosition(fractionDownBell: number): number {
	const y = BELL_TOP + fractionDownBell * (BELL_BOTTOM - BELL_TOP);
	return (y - BELL_GRADIENT_TOP) / (BELL_GRADIENT_BOTTOM - BELL_GRADIENT_TOP);
}

function paint(terminal: Terminal, row: string, hex: string): string {
	return terminal.colour(row, hex) + ' '.repeat(LOGO_WIDTH - row.length);
}
