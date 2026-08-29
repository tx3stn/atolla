import Strings from 'atolla_headless/src/Strings';

export type ArgumentKind = 'boolean' | 'value';

export interface Flag {
	describe: () => string;
	kind: ArgumentKind;
}

export type Flags = Record<string, Flag>;

export const FLAG_HELP = '--help';
export const FLAG_NO_COLOR = '--no-color';
export const FLAG_VERSION = '--version';

export const RootFlags: Flags = {
	[FLAG_HELP]: { describe: Strings.flagHelp, kind: 'boolean' },
	[FLAG_NO_COLOR]: { describe: Strings.flagNoColor, kind: 'boolean' },
	[FLAG_VERSION]: { describe: Strings.flagVersion, kind: 'boolean' },
};
