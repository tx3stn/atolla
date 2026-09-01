import type { LanguageCode } from 'atolla_core/src/Language';
import type { LogLevel } from 'atolla_core/src/services/Logger';
import type { StoreFiles } from '../FileKeyValueStore';
import type { ConfigStore } from '../PlayerConfig';
import type { RandomBytes } from '../Random';
import type { Terminal } from '../terminal/Terminal';
import type { ParsedArguments } from './Arguments';
import type { Flags } from './Flags';

// NOTE: for testability if a command requires something that involves Valdi
// libraries it should be made available via the CommandContext.
export interface CommandContext {
	args: ParsedArguments;
	config: ConfigStore;
	files: StoreFiles;
	// the level this invocation prints at: the global --log-level, or the configured level
	logLevel: LogLevel;
	randomBytes: RandomBytes;
	setLanguage: (language: LanguageCode) => void;
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
