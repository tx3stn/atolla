import { beside, fields } from '../terminal/Layout';
import { LOGO_WIDTH, logoLines } from '../terminal/Logo';
import type { Terminal } from '../terminal/Terminal';

export interface Cmd {
	action: (terminal: Terminal) => number;
	helpTextLong: string;
	helpTextShort: string;
}

export const AllCmds = {
	pair: {
		action: pair,
		helpTextLong: '',
		helpTextShort: 'pair this player with your device',
	},
	run: {
		action: run,
		helpTextLong: '',
		helpTextShort: 'run the player daemon',
	},
} satisfies Record<string, Cmd>;

export const AllFlags: Record<string, string> = {
	'--help': 'print the help text',
	'--no-color': 'disable colored output',
};

export function help(terminal: Terminal): void {
	const commands = Object.entries(AllCmds).map(([name, cfg]): [string, string] => [
		name,
		cfg.helpTextShort,
	]);
	const flags = Object.entries(AllFlags);
	const width = [...commands, ...flags].reduce(
		(widest, [name]) => Math.max(widest, name.length),
		0,
	);

	section(terminal, 'commands', commands, width);
	terminal.write('');
	section(terminal, 'flags', flags, width);
}

function section(
	terminal: Terminal,
	title: string,
	entries: Array<[string, string]>,
	width: number,
): void {
	terminal.write(title);

	for (const [name, text] of entries) {
		terminal.write(`  ${name.padEnd(width)}  ${text}`);
	}
}

function pair(terminal: Terminal): number {
	terminal.write('pairing code');
	terminal.write('');
	terminal.write('    4 8 2 9 1 7');
	terminal.write('');
	terminal.write('enter it in atolla on your phone: Settings → Players → Add player');

	return 0;
}

function run(terminal: Terminal): number {
	const version = '0.0.0';
	const summary = [
		'',
		terminal.dim(`atolla ${version} — headless player`),
		'',
		...fields(terminal, [
			{ label: 'name', value: 'living room' },
			{ label: 'player id', value: 'atolla hedless 666' },
			{ label: 'control', value: 'http://0.0.0.0:45889' },
			{ label: 'audio device', value: 'hw:2,0 Topping E30' },
			{ label: 'state', value: 'idle' },
		]),
	];

	for (const line of beside(logoLines(terminal), LOGO_WIDTH, summary)) {
		terminal.write(line);
	}

	terminal.write('');
	terminal.write(terminal.dim('placeholder output — nothing is implemented; this process will'));
	terminal.write(terminal.dim('sit here until it is killed.'));

	return 0;
}
