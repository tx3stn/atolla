import Strings from 'atolla_headless/src/Strings';

export type ArgumentKind = 'boolean' | 'value';

export interface Flag {
	describe: () => string;
	kind: ArgumentKind;
}

export type Flags = Record<string, Flag>;

export const FLAG_AUDIO_DEVICE = '--audio-device';
export const FLAG_CONFIG = '--config';
export const FLAG_HELP = '--help';
export const FLAG_LANGUAGE = '--language';
export const FLAG_LOG_LEVEL = '--log-level';
export const FLAG_NAME = '--name';
export const FLAG_NO_COLOR = '--no-color';
export const FLAG_PORT = '--port';
export const FLAG_VERSION = '--version';

// --config, --log-level and --no-color are consumed before dispatch because they apply to every
// invocation; they are declared here so the root help lists what it accepts
export const RootFlags: Flags = {
	[FLAG_CONFIG]: { describe: Strings.flagConfig, kind: 'value' },
	[FLAG_HELP]: { describe: Strings.flagHelp, kind: 'boolean' },
	[FLAG_LOG_LEVEL]: { describe: Strings.flagLogLevel, kind: 'value' },
	[FLAG_NO_COLOR]: { describe: Strings.flagNoColor, kind: 'boolean' },
	[FLAG_VERSION]: { describe: Strings.flagVersion, kind: 'boolean' },
};
