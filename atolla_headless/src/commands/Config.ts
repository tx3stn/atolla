import Strings from 'atolla_headless/src/Strings';
import { fields } from '../terminal/Layout';
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
	run: async ({ args, config, terminal }: CommandContext): Promise<number> => {
		const current = config.read();
		if (current === undefined) {
			throw CLI_ERROR.withDetail(Strings.errorConfigMissing(config.path));
		}

		const language = args.value(FLAG_LANGUAGE);
		const name = args.value(FLAG_NAME);

		if (language === undefined && name === undefined) {
			for (const line of fields(terminal, [
				{ label: Strings.fieldName(), value: current.name },
				{ label: Strings.fieldLanguage(), value: current.language },
				{ label: Strings.fieldConfig(), value: config.path },
			])) {
				terminal.write(line);
			}

			return 0;
		}

		config.write({
			dataDir: current.dataDir,
			language: language === undefined ? current.language : readLanguage(language),
			name: name ?? current.name,
		});
		terminal.write(Strings.configWritten(config.path));

		return 0;
	},
} satisfies Cmd;
