import { describe, expect, it } from 'bun:test';
import Strings from 'atolla_headless/src/Strings';
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
		const lines = render((terminal) => commandHelp(terminal, 'pair', AllCmds.pair));

		for (const name of Object.keys(AllCmds.pair.flags)) {
			expect(lines.some((line) => line.includes(name))).toBe(true);
		}
	});

	it('describes each flag rather than only naming it', () => {
		const lines = render((terminal) => commandHelp(terminal, 'pair', AllCmds.pair));
		const reset = lines.find((line) => line.includes('--reset'));

		expect(reset).toBeDefined();
		expect(reset).toContain(AllCmds.pair.flags['--reset'].describe());
	});

	it('shows a usage line naming the command', () => {
		const lines = render((terminal) => commandHelp(terminal, 'pair', AllCmds.pair));

		expect(lines).toContain(Strings.helpUsage());
		expect(lines).toContain('  atolla pair [flags]');
	});

	it('omits [flags] from usage for a command that declares none', () => {
		const lines = render((terminal) => commandHelp(terminal, 'run', AllCmds.run));

		expect(Object.keys(AllCmds.run.flags)).toEqual([]);
		expect(lines).toContain('  atolla run');
		expect(lines).not.toContain(Strings.helpFlags());
	});
});

describe('help', () => {
	it('opens with the description and the usage block', () => {
		const lines = render(help);

		expect(lines[0]).toBe(Strings.rootDescription());
		expect(lines).toContain(Strings.helpUsage());
		expect(lines).toContain('  atolla <command> [flags]');
	});

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
		const rows = lines.filter((line) => line.startsWith('  ') && line.includes('  ', 2));
		const descriptionStarts = rows.map((line) => line.indexOf(line.trim().split(/\s\s+/)[1]));

		expect(new Set(descriptionStarts).size).toBe(1);
	});

	it('closes by pointing at per-command help', () => {
		const lines = render(help);

		expect(lines[lines.length - 1]).toBe(Strings.helpMoreInfo());
	});
});
