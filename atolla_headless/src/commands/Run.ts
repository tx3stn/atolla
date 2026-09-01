import { version } from 'atolla_core/src/version';
import Strings from 'atolla_headless/src/Strings';
import { filterLogWriter, startDaemon } from '../Daemon';
import { makeFileKeyValueStore } from '../FileKeyValueStore';
import { type PlayerConfig, stateDir } from '../PlayerConfig';
import { loadPlayerIdentity, type PlayerIdentity } from '../PlayerIdentity';
import { beside, fields } from '../terminal/Layout';
import { LOGO_WIDTH, logoLines } from '../terminal/Logo';
import type { Terminal } from '../terminal/Terminal';
import type { Cmd, CommandContext } from './Command';
import { CLI_ERROR } from './Errors';

export const CmdRun = {
	flags: {},
	helpTextLong: Strings.runHelpLong,
	helpTextShort: Strings.runHelpShort,
	run: async ({
		config,
		files,
		logLevel,
		randomBytes,
		terminal,
	}: CommandContext): Promise<number> => {
		const current = config.read();
		if (current === undefined) {
			throw CLI_ERROR.withDetail(Strings.errorConfigMissing(config.path));
		}

		const identity = await loadPlayerIdentity(
			makeFileKeyValueStore(files, stateDir(current)),
			randomBytes,
			current.name,
		);

		banner(terminal, current, identity);

		return startDaemon({
			config: current,
			files,
			log: filterLogWriter(logLevel, terminal.write),
		});
	},
} satisfies Cmd;

function banner(terminal: Terminal, config: PlayerConfig, identity: PlayerIdentity): void {
	terminal.write('');

	const summary = [
		'',
		'',
		terminal.dim(`atolla ${version}`),
		'',
		...fields(terminal, [
			{ label: Strings.fieldName(), value: config.name },
			{ label: Strings.fieldPlayerId(), value: identity.id },
			{ label: Strings.fieldControl(), value: `http://0.0.0.0:${config.port}` },
			{ label: Strings.fieldAudioDevice(), value: config.audioDevice },
			{ label: Strings.fieldState(), value: Strings.stateIdle() },
		]),
	];

	for (const line of beside(logoLines(terminal), LOGO_WIDTH, summary)) {
		terminal.write(line);
	}

	terminal.write('');
}
