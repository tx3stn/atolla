interface DebugLoggerNativeFns {
	clearLog(): void;
	exportLog(): string;
	exportTextFile(fileName: string, contents: string): string;
	getLogFilePath(): string;
	shareLog(): void;
	shareTextFile(fileName: string, contents: string): void;
	writeLog(entry: string): void;
}

class DebugLoggerService {
	private enabled = false;
	private fns: DebugLoggerNativeFns | null = null;

	register(fns: DebugLoggerNativeFns): void {
		this.fns = fns;
	}

	setEnabled(enabled: boolean): void {
		this.enabled = enabled;
	}

	isEnabled(): boolean {
		return this.enabled;
	}

	log(tag: string, message: string, data?: unknown): void {
		if (!this.enabled) return;
		const ts = new Date().toISOString();
		const suffix = data !== undefined ? ` ${JSON.stringify(data)}` : '';
		const entry = `${ts} [${tag}] ${message}${suffix}`;
		console.warn(`[DBG] ${entry}`);
		try {
			this.fns?.writeLog(entry);
		} catch {
			// best effort
		}
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
}

export const DebugLogger = new DebugLoggerService();
