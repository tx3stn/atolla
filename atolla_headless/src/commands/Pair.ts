import Strings from 'atolla_headless/src/Strings';
import type { Cmd, CommandContext } from './Command';

export const CmdPair = {
	flags: {
		'--reset': { describe: Strings.flagPairReset, kind: 'boolean' },
		'--status': { describe: Strings.flagPairStatus, kind: 'boolean' },
	},
	helpTextLong: Strings.pairHelpLong,
	helpTextShort: Strings.pairHelpShort,
	run: ({ args, terminal }: CommandContext): number => {
		if (args.flag('--reset') || args.flag('--status')) {
			terminal.write(Strings.notImplemented());
			return 0;
		}

		terminal.write(Strings.pairingCodeHeading());
		terminal.write('');
		terminal.write('    4 8 2 9 1 7');
		terminal.write('');
		terminal.write(Strings.pairingInstructions());

		return 0;
	},
} satisfies Cmd;
