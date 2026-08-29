import Strings from 'atolla_headless/src/Strings';

export const FLAG_HELP = '--help';
export const FLAG_NO_COLOR = '--no-color';
export const FLAG_VERSION = '--version';

export const AllFlags = {
	[FLAG_HELP]: Strings.flagHelp,
	[FLAG_NO_COLOR]: Strings.flagNoColor,
	[FLAG_VERSION]: Strings.flagVersion,
} satisfies Record<string, () => string>;
