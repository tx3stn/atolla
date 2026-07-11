import { redactSensitiveUrlParams } from '../utils/RedactUrl';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// a namespaced logger. the namespace is bound once via getLogger(), so call sites pass only the
// message and optional data (e.g. `log.info('rendered', { count })`).
export interface Log {
	debug(message: string, data?: unknown): void;
	error(message: string, data?: unknown): void;
	info(message: string, data?: unknown): void;
	warn(message: string, data?: unknown): void;
}

export interface LoggerNativeFns {
	clearLog(): void;
	exportLog(): string;
	exportTextFile(fileName: string, contents: string): string;
	getLogFilePath(): string;
	shareLog(): void;
	shareTextFile(fileName: string, contents: string): void;
	writeLog(entry: string): void;
}

// the app-global control surface: bind the native sink, toggle diagnostic logging, and export/share
// the log file. logging itself goes through getLogger(); this is only used by App bootstrap and
// SettingsView.
export interface LoggerControl {
	clearLog(): void;
	exportLog(): string;
	exportTextFile(fileName: string, contents: string): string;
	getLogFilePath(): string;
	isEnabled(): boolean;
	register(fns: LoggerNativeFns): void;
	setEnabled(enabled: boolean): void;
	shareLog(): void;
	shareTextFile(fileName: string, contents: string): void;
}

class LoggerService {
	private enabled = false;
	private fns: LoggerNativeFns | null = null;

	register(fns: LoggerNativeFns): void {
		this.fns = fns;
	}

	setEnabled(enabled: boolean): void {
		this.enabled = enabled;
	}

	isEnabled(): boolean {
		return this.enabled;
	}

	getLogFilePath(): string {
		try {
			return this.fns?.getLogFilePath() ?? '';
		} catch {
			return '';
		}
	}

	clearLog(): void {
		try {
			this.fns?.clearLog();
		} catch {
			// best effort
		}
	}

	exportLog(): string {
		try {
			return this.fns?.exportLog() ?? '';
		} catch {
			return '';
		}
	}

	shareLog(): void {
		try {
			this.fns?.shareLog();
		} catch {
			// best effort
		}
	}

	exportTextFile(fileName: string, contents: string): string {
		try {
			return this.fns?.exportTextFile(fileName, contents) ?? '';
		} catch {
			return '';
		}
	}

	shareTextFile(fileName: string, contents: string): void {
		try {
			this.fns?.shareTextFile(fileName, contents);
		} catch {
			// best effort
		}
	}

	// every entry always goes to the platform console; the shareable log file is written only when
	// diagnostic logging is enabled in settings (so logging off leaves nothing persisted). entries
	// are redacted regardless of destination.
	write(level: LogLevel, namespace: string, message: string, data?: unknown): void {
		const suffix = data !== undefined ? ` ${JSON.stringify(data)}` : '';
		const entry = redactSensitiveUrlParams(
			`${new Date().toISOString()} [${level.toUpperCase()}] [${namespace}] ${message}${suffix}`,
		);

		if (level === 'error') {
			console.error(entry);
		} else if (level === 'warn') {
			console.warn(entry);
		} else {
			console.log(entry);
		}
		if (this.enabled) {
			try {
				this.fns?.writeLog(entry);
			} catch {
				// best effort
			}
		}
	}
}

const sink = new LoggerService();

export function getLogger(namespace: string): Log {
	return {
		debug: (message, data) => sink.write('debug', namespace, message, data),
		error: (message, data) => sink.write('error', namespace, message, data),
		info: (message, data) => sink.write('info', namespace, message, data),
		warn: (message, data) => sink.write('warn', namespace, message, data),
	};
}

export const Logger: LoggerControl = sink;
