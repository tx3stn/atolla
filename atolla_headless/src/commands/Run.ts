import { version } from 'atolla_core/src/version';
import Strings from 'atolla_headless/src/Strings';
import { beside, fields } from '../terminal/Layout';
import { LOGO_WIDTH, logoLines } from '../terminal/Logo';
import type { Terminal } from '../terminal/Terminal';
import type { Cmd } from './Command';

export const CmdRun = {
	action: run,
	helpTextLong: Strings.runHelpLong,
	helpTextShort: Strings.runHelpShort,
} satisfies Cmd;

function run(terminal: Terminal): number {
	terminal.write('');

	const summary = [
		'',
		'',
		terminal.dim(`atolla ${version}`),
		'',
		...fields(terminal, [
			{ label: Strings.fieldName(), value: 'living room' },
			{ label: Strings.fieldPlayerId(), value: 'atolla headless 666' },
			{ label: Strings.fieldControl(), value: 'http://0.0.0.0:45889' },
			{ label: Strings.fieldAudioDevice(), value: 'hw:2,0 Topping E30' },
			{ label: Strings.fieldState(), value: Strings.stateIdle() },
		]),
	];

	for (const line of beside(logoLines(terminal), LOGO_WIDTH, summary)) {
		terminal.write(line);
	}

	terminal.write('');
	for (const line of Strings.runPlaceholderNotice().split('\n')) {
		terminal.write(terminal.dim(line));
	}

	return 0;
}
