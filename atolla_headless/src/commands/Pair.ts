import type { Terminal } from '../terminal/Terminal';
import type { Cmd } from './Command';

export const CmdPair = {
	action: pair,
	helpTextLong: '',
	helpTextShort: 'pair this player with your device',
} satisfies Cmd;

function pair(terminal: Terminal): number {
	terminal.write('pairing code');
	terminal.write('');
	terminal.write('    4 8 2 9 1 7');
	terminal.write('');
	terminal.write('enter it in atolla on your phone: Settings → Players → Add player');

	return 0;
}
