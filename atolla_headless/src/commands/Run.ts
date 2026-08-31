import { version } from 'atolla_core/src/version';
import Strings from 'atolla_headless/src/Strings';
import { startDaemon } from '../Daemon';
import type { PlayerConfig } from '../PlayerConfig';
import { beside, fields } from '../terminal/Layout';
import { LOGO_WIDTH, logoLines } from '../terminal/Logo';
import type { Terminal } from '../terminal/Terminal';
import type { Cmd, CommandContext } from './Command';
import { CLI_ERROR } from './Errors';

export const CmdRun = {
	flags: {},
	helpTextLong: Strings.runHelpLong,
	helpTextShort: Strings.runHelpShort,
	run: async ({ config, terminal }: CommandContext): Promise<number> => {
		const current = config.read();
		if (current === undefined) {
			throw CLI_ERROR.withDetail(Strings.errorConfigMissing(config.path));
		}

		banner(terminal, current);

		return startDaemon({
			config: current,
			log: (_level, entry) => terminal.write(entry),
		});
	},
} satisfies Cmd;

function banner(terminal: Terminal, config: PlayerConfig): void {
	terminal.write('');

	const summary = [
		'',
		'',
		terminal.dim(`atolla ${version}`),
		'',
		...fields(terminal, [
			{ label: Strings.fieldName(), value: config.name },
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
}
