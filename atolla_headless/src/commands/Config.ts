import Strings from 'atolla_headless/src/Strings';
import type { Cmd, CommandContext } from './Command';
import { CLI_ERROR } from './Errors';
import { FLAG_LANGUAGE, FLAG_NAME } from './Flags';
import { readLanguage } from './Init';

export const CmdConfig = {
	flags: {
		[FLAG_LANGUAGE]: { describe: Strings.flagLanguage, kind: 'value' },
		[FLAG_NAME]: { describe: Strings.flagName, kind: 'value' },
	},
	helpTextLong: Strings.configHelpLong,
	helpTextShort: Strings.configHelpShort,
	run: async ({ args, config, setLanguage, terminal }: CommandContext): Promise<number> => {
		const current = config.read();
		if (current === undefined) {
			throw CLI_ERROR.withDetail(Strings.errorConfigMissing(config.path));
		}

		const language = args.value(FLAG_LANGUAGE);
		const name = args.value(FLAG_NAME);

		if (language === undefined && name === undefined) {
			terminal.write(`${terminal.dim(Strings.configFile())} ${config.path}`);
			terminal.write(JSON.stringify(current, null, '  '));

			return 0;
		}

		const updated = {
			dataDir: current.dataDir,
			language: language === undefined ? current.language : readLanguage(language),
			name: name ?? current.name,
		};

		// the language the operator just chose, so this invocation's own output honours it
		setLanguage(updated.language);
		config.write(updated);
		terminal.write(`${terminal.dim(Strings.configUpdated())} ${config.path}`);

		return 0;
	},
} satisfies Cmd;
