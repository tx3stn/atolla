import { describe, expect, it } from 'bun:test';
import { makeTerminal } from '../terminal/Terminal';
import { AllCmds } from './All';
import { commandHelp, help } from './Help';

function render(write: (terminal: ReturnType<typeof makeTerminal>) => void): Array<string> {
	const lines: Array<string> = [];
	write(makeTerminal((text) => lines.push(text.replace(/\n$/, '')), false));
	return lines;
}

describe('commandHelp', () => {
	it('lists every declared flag of the command', () => {
		const lines = render((terminal) => commandHelp(terminal, AllCmds.pair));

		for (const name of Object.keys(AllCmds.pair.flags)) {
			expect(lines.some((line) => line.includes(name))).toBe(true);
		}
	});

	it('describes each flag rather than only naming it', () => {
		const lines = render((terminal) => commandHelp(terminal, AllCmds.pair));
		const reset = lines.find((line) => line.includes('--reset'));

		expect(reset).toBeDefined();
		expect(reset).toContain(AllCmds.pair.flags['--reset'].describe());
	});

	it('omits the flags heading for a command that declares none', () => {
		const lines = render((terminal) => commandHelp(terminal, AllCmds.run));

		expect(Object.keys(AllCmds.run.flags)).toEqual([]);
		expect(lines).toEqual([AllCmds.run.helpTextLong()]);
	});
});

describe('help', () => {
	it('lists every command with its summary', () => {
		const lines = render(help);

		for (const [name, cmd] of Object.entries(AllCmds)) {
			const row = lines.find((line) => line.startsWith(`  ${name} `));
			expect(row).toBeDefined();
			expect(row).toContain(cmd.helpTextShort());
		}
	});

	it('aligns command and flag names in one column', () => {
		const lines = render(help);
		const rows = lines.filter((line) => line.startsWith('  '));
		const descriptionStarts = rows.map((line) => line.indexOf(line.trim().split(/\s\s+/)[1]));

		expect(new Set(descriptionStarts).size).toBe(1);
	});
});
