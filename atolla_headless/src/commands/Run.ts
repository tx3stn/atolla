import { beside, fields } from '../terminal/Layout';
import { LOGO_WIDTH, logoLines } from '../terminal/Logo';
import type { Terminal } from '../terminal/Terminal';
import type { Cmd } from './Command';

export const CmdRun = {
	action: run,
	helpTextLong: `atolla run [flags]

run the player deamon

TODO: add instructions about usage and backgrounding
`,
	helpTextShort: 'run the player daemon',
} satisfies Cmd;

function run(terminal: Terminal): number {
	const version = '0.0.0';

	terminal.write('');

	const summary = [
		'',
		'',
		terminal.dim(`atolla ${version}`),
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
