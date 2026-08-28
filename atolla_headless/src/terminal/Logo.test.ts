import { describe, expect, it } from 'bun:test';
import { BELL_ROWS, LOGO_WIDTH, logoLines } from './Logo';
import { makeTerminal } from './Terminal';

const plain = makeTerminal(() => {}, false);
const coloured = makeTerminal(() => {}, true);

function channelsOf(line: string): Array<number> {
	const sequence = line.slice(0, line.indexOf('m'));
	return sequence
		.slice(sequence.lastIndexOf(';2;') + 3)
		.split(';')
		.map(Number);
}

describe('logoLines', () => {
	it('pads every line to exactly LOGO_WIDTH', () => {
		for (const line of logoLines(plain)) {
			expect(line.length).toBe(LOGO_WIDTH);
		}
	});

	it('resets the colour before the padding so a bare logo line trims clean', () => {
		for (const line of logoLines(coloured)) {
			expect(line.replace(/\s+$/, '').endsWith('\x1b[0m')).toBe(true);
		}
	});

	it('gives every line its own foreground colour', () => {
		const colours = logoLines(coloured).map((line) => line.slice(0, line.indexOf('m') + 1));
		expect(colours.every((colour) => colour.startsWith('\x1b[38;2;'))).toBe(true);
		expect(new Set(colours).size).toBe(colours.length);
	});

	it('runs the bell from purple down to blue', () => {
		const bell = logoLines(coloured).slice(0, BELL_ROWS).map(channelsOf);
		const first = bell[0];
		const last = bell[bell.length - 1];
		expect(first[0]).toBeGreaterThan(last[0]);
		expect(first[2]).toBeGreaterThan(100);
		expect(last[2]).toBeGreaterThan(last[0]);
	});

	it('runs the tentacles from navy into cyan', () => {
		const tentacles = logoLines(coloured).slice(BELL_ROWS).map(channelsOf);
		const first = tentacles[0];
		const last = tentacles[tentacles.length - 1];
		expect(last[1]).toBeGreaterThan(first[1]);
		expect(last[2]).toBeGreaterThan(first[2]);
		expect(last[0]).toBeLessThan(last[2]);
	});
});
