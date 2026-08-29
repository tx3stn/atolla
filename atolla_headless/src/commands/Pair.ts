import Strings from 'atolla_headless/src/Strings';
import type { Terminal } from '../terminal/Terminal';
import type { Cmd } from './Command';

export const CmdPair = {
	action: pair,
	helpTextLong: Strings.pairHelpLong,
	helpTextShort: Strings.pairHelpShort,
} satisfies Cmd;

function pair(terminal: Terminal): number {
	terminal.write(Strings.pairingCodeHeading());
	terminal.write('');
	terminal.write('    4 8 2 9 1 7');
	terminal.write('');
	terminal.write(Strings.pairingInstructions());

	return 0;
}
