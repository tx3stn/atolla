import Strings from 'atolla_headless/src/Strings';
import type { Terminal } from '../terminal/Terminal';
import { AllCmds } from './All';
import type { Cmd } from './Command';
import { type Flags, RootFlags } from './Flags';

type Row = [string, string];

export function commandHelp(terminal: Terminal, name: string, cmd: Cmd): number {
	const flags = flagRows(cmd.flags);
	const lines = [
		cmd.helpTextLong(),
		'',
		...section(Strings.helpUsage(), [usage(name, cmd.flags)]),
		...section(Strings.helpFlags(), aligned(flags, columnWidth(flags))),
	];

	for (const line of lines) {
		terminal.write(line);
	}

	return 0;
}

export function help(terminal: Terminal): number {
	const commands = Object.entries(AllCmds).map(([name, cmd]): Row => [name, cmd.helpTextShort()]);
	const flags = flagRows(RootFlags);
	const width = columnWidth([...commands, ...flags]);
	const lines = [
		Strings.rootDescription(),
		'',
		...section(Strings.helpUsage(), ['atolla [flags]', 'atolla <command> [flags]']),
		...section(Strings.helpCommands(), aligned(commands, width)),
		...section(Strings.helpFlags(), aligned(flags, width)),
		Strings.helpMoreInfo(),
	];

	for (const line of lines) {
		terminal.write(line);
	}

	return 0;
}

function aligned(rows: Array<Row>, width: number): Array<string> {
	return rows.map(([name, text]) => `${name.padEnd(width)}  ${text}`);
}

function columnWidth(rows: Array<Row>): number {
	return rows.reduce((widest, [name]) => Math.max(widest, name.length), 0);
}

function flagRows(flags: Flags): Array<Row> {
	return Object.entries(flags).map(([name, flag]): Row => [name, flag.describe()]);
}

function section(heading: string, lines: Array<string>): Array<string> {
	if (lines.length === 0) {
		return [];
	}

	return [heading, ...lines.map((line) => `  ${line}`), ''];
}

function usage(name: string, flags: Flags): string {
	return Object.keys(flags).length === 0 ? `atolla ${name}` : `atolla ${name} [flags]`;
}
