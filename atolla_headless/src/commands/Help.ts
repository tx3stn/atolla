import Strings from 'atolla_headless/src/Strings';
import type { Terminal } from '../terminal/Terminal';
import { AllCmds } from './All';
import type { Cmd } from './Command';
import { type Flags, RootFlags } from './Flags';

type Row = [string, string];

export function commandHelp(terminal: Terminal, cmd: Cmd): number {
	const flags = flagRows(cmd.flags);

	terminal.write(cmd.helpTextLong());
	writeSection(terminal, Strings.helpFlags(), flags, columnWidth(flags));

	return 0;
}

export function help(terminal: Terminal): number {
	const commands = Object.entries(AllCmds).map(([name, cmd]): Row => [name, cmd.helpTextShort()]);
	const flags = flagRows(RootFlags);
	const width = columnWidth([...commands, ...flags]);

	writeSection(terminal, Strings.helpCommands(), commands, width);
	terminal.write('');
	writeSection(terminal, Strings.helpFlags(), flags, width);

	return 0;
}

function columnWidth(rows: Array<Row>): number {
	return rows.reduce((widest, [name]) => Math.max(widest, name.length), 0);
}

function flagRows(flags: Flags): Array<Row> {
	return Object.entries(flags).map(([name, flag]): Row => [name, flag.describe()]);
}

function writeSection(terminal: Terminal, heading: string, rows: Array<Row>, width: number): void {
	if (rows.length === 0) {
		return;
	}

	terminal.write(heading);

	for (const [name, text] of rows) {
		terminal.write(`  ${name.padEnd(width)}  ${text}`);
	}
}
