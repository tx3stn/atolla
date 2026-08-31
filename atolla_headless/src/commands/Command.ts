import type { ConfigStore } from '../PlayerConfig';
import type { Terminal } from '../terminal/Terminal';
import type { ParsedArguments } from './Arguments';
import type { Flags } from './Flags';

export interface CommandContext {
	args: ParsedArguments;
	config: ConfigStore;
	terminal: Terminal;
}

export interface Runnable {
	flags: Flags;
	run: (context: CommandContext) => Promise<number>;
}

export interface Cmd extends Runnable {
	helpTextLong: () => string;
	helpTextShort: () => string;
}
