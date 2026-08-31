import Strings from 'atolla_headless/src/Strings';
import { readLanguage, readPort } from '../PlayerConfig';
import type { Cmd, CommandContext } from './Command';
import { CLI_ERROR } from './Errors';
import { FLAG_AUDIO_DEVICE, FLAG_LANGUAGE, FLAG_NAME, FLAG_PORT } from './Flags';

export const CmdConfig = {
	flags: {
		[FLAG_AUDIO_DEVICE]: { describe: Strings.flagAudioDevice, kind: 'value' },
		[FLAG_LANGUAGE]: { describe: Strings.flagLanguage, kind: 'value' },
		[FLAG_NAME]: { describe: Strings.flagName, kind: 'value' },
		[FLAG_PORT]: { describe: Strings.flagPort, kind: 'value' },
	},
	helpTextLong: Strings.configHelpLong,
	helpTextShort: Strings.configHelpShort,
	run: async ({ args, config, setLanguage, terminal }: CommandContext): Promise<number> => {
		const current = config.read();
		if (current === undefined) {
			throw CLI_ERROR.withDetail(Strings.errorConfigMissing(config.path));
		}

		const audioDevice = args.value(FLAG_AUDIO_DEVICE);
		const language = args.value(FLAG_LANGUAGE);
		const name = args.value(FLAG_NAME);
		const port = args.value(FLAG_PORT);

		if (
			audioDevice === undefined &&
			language === undefined &&
			name === undefined &&
			port === undefined
		) {
			terminal.write(`${terminal.dim(Strings.configFile())} ${config.path}`);
			terminal.write(JSON.stringify(current, null, '  '));

			return 0;
		}

		const updated = {
			audioDevice: audioDevice ?? current.audioDevice,
			dataDir: current.dataDir,
			language: language === undefined ? current.language : readLanguage(language),
			logLevel: current.logLevel,
			name: name ?? current.name,
			port: port === undefined ? current.port : readPort(port),
		};

		// the language the operator just chose, so this invocation's own output honours it
		setLanguage(updated.language);
		config.write(updated);
		terminal.write(`${terminal.dim(Strings.configUpdated())} ${config.path}`);

		return 0;
	},
} satisfies Cmd;
