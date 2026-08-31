import { DEFAULT_LANGUAGE } from 'atolla_core/src/Language';
import Strings from 'atolla_headless/src/Strings';
import { isLanguageCode } from '../PlayerConfig';
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
	run: async ({ args, config, terminal }: CommandContext): Promise<number> => {
		if (config.read() !== undefined) {
			throw CLI_ERROR.withDetail(Strings.errorConfigExists(config.path));
		}

		config.write({
			language: readLanguage(args.value(FLAG_LANGUAGE)),
			name: args.value(FLAG_NAME) ?? '',
		});
		terminal.write(Strings.configWritten(config.path));

		return 0;
	},
} satisfies Cmd;

export function readLanguage(value: string | undefined) {
	if (value === undefined) {
		return DEFAULT_LANGUAGE;
	}
	if (!isLanguageCode(value)) {
		throw CLI_ERROR.withDetail(Strings.errorUnknownLanguage(value));
	}

	return value;
}
