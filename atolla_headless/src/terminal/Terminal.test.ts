import { describe, expect, it } from 'bun:test';
import { makeTerminal } from './Terminal';

function collector() {
	const written: Array<string> = [];
	return { terminal: (colour: boolean) => makeTerminal((t) => written.push(t), colour), written };
}

describe('makeTerminal', () => {
	it('terminates every line with exactly one newline', () => {
		const { terminal, written } = collector();
		terminal(false).write('hello');
		expect(written).toEqual(['hello\n']);
	});

	it('emits no escape sequences when colour is off', () => {
		const plain = makeTerminal(() => {}, false);
		expect(plain.colour('atolla', '#AA5CC3')).toBe('atolla');
		expect(plain.dim('atolla')).toBe('atolla');
	});

	it('emits a 24-bit foreground sequence when colour is on', () => {
		const coloured = makeTerminal(() => {}, true);
		expect(coloured.colour('atolla', '#AA5CC3')).toBe('\x1b[38;2;170;92;195matolla\x1b[0m');
		expect(coloured.dim('atolla')).toBe('\x1b[2matolla\x1b[0m');
	});
});
