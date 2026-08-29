import type { Terminal } from '../terminal/Terminal';
import { AllCmds } from './All';
import type { Cmd } from './Command';
import { AllFlags } from './Flags';

export function commandHelp(terminal: Terminal, cmd: Cmd): number {
	terminal.write(cmd.helpTextLong);
	return 0;
}

export function help(terminal: Terminal): number {
	const commands = Object.entries(AllCmds).map(([name, cfg]): [string, string] => [
		name,
		cfg.helpTextShort,
	]);
	const flags = Object.entries(AllFlags);
	const width = [...commands, ...flags].reduce(
		(widest, [name]) => Math.max(widest, name.length),
		0,
	);

	terminal.write('commands');

	for (const [name, cmd] of Object.entries(AllCmds)) {
		terminal.write(`  ${name.padEnd(width)}  ${cmd.helpTextShort}`);
	}

	terminal.write('');
	terminal.write('flags');

	for (const [name, text] of Object.entries(AllFlags)) {
		terminal.write(`  ${name.padEnd(width)}  ${text}`);
	}

	return 0;
}
