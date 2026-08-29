import type { Terminal } from '../terminal/Terminal';
import type { ParsedArguments } from './Arguments';
import type { Flags } from './Flags';

export interface Runnable {
	flags: Flags;
	run: (terminal: Terminal, args: ParsedArguments) => number;
}

export interface Cmd extends Runnable {
	helpTextLong: () => string;
	helpTextShort: () => string;
}
