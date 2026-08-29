export const FLAG_HELP = '--help';
export const FLAG_NO_COLOR = '--no-color';
export const FLAG_VERSION = '--version';

export const AllFlags = {
	[FLAG_HELP]: 'print the help text',
	[FLAG_NO_COLOR]: 'disable colored output',
	[FLAG_VERSION]: 'the current version of the app',
} satisfies Record<string, string>;
