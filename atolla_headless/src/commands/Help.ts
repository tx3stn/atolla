import Strings from 'atolla_headless/src/Strings';
import type { Terminal } from '../terminal/Terminal';
import { AllCmds } from './All';
import type { Cmd } from './Command';
import { AllFlags } from './Flags';

export function commandHelp(terminal: Terminal, cmd: Cmd): number {
	terminal.write(cmd.helpTextLong());
	return 0;
}

export function help(terminal: Terminal): number {
	const commands = Object.entries(AllCmds).map(([name, cfg]): [string, string] => [
		name,
		cfg.helpTextShort(),
	]);
	const flags = Object.entries(AllFlags).map(([name, text]): [string, string] => [name, text()]);
	const width = [...commands, ...flags].reduce(
		(widest, [name]) => Math.max(widest, name.length),
		0,
	);

	terminal.write(Strings.helpCommands());

	for (const [name, text] of commands) {
		terminal.write(`  ${name.padEnd(width)}  ${text}`);
	}

	terminal.write('');
	terminal.write(Strings.helpFlags());

	for (const [name, text] of flags) {
		terminal.write(`  ${name.padEnd(width)}  ${text}`);
	}

	return 0;
}
