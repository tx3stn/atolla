import type { Terminal } from '../terminal/Terminal';

export interface Cmd {
	action: (terminal: Terminal) => number;
	helpTextLong: string;
	helpTextShort: string;
}
