import Strings from 'atolla_headless/src/Strings';
import {
	DEFAULT_AUDIO_DEVICE,
	DEFAULT_DATA_DIR,
	DEFAULT_LOG_LEVEL,
	DEFAULT_PORT,
	readLanguage,
} from '../PlayerConfig';
import type { Cmd, CommandContext } from './Command';
import { CLI_ERROR } from './Errors';
import { FLAG_LANGUAGE, FLAG_NAME } from './Flags';

export const CmdInit = {
	flags: {
		[FLAG_LANGUAGE]: { describe: Strings.flagLanguage, kind: 'value' },
		[FLAG_NAME]: { describe: Strings.flagName, kind: 'value' },
	},
	helpTextLong: Strings.initHelpLong,
	helpTextShort: Strings.initHelpShort,
	run: async ({ args, config, setLanguage, terminal }: CommandContext): Promise<number> => {
		if (config.read() !== undefined) {
			throw CLI_ERROR.withDetail(Strings.errorConfigExists(config.path));
		}

		const written = {
			audioDevice: DEFAULT_AUDIO_DEVICE,
			dataDir: DEFAULT_DATA_DIR,
			language: readLanguage(args.value(FLAG_LANGUAGE)),
			logLevel: DEFAULT_LOG_LEVEL,
			name: args.value(FLAG_NAME) ?? '',
			port: DEFAULT_PORT,
		};

		// the language the operator just chose, so this invocation's own output honours it; without
		// this the confirmation is English because main resolved the language before the file existed
		setLanguage(written.language);
		config.write(written);
		terminal.write(`${terminal.dim(Strings.configCreated())} ${config.path}`);

		return 0;
	},
} satisfies Cmd;
