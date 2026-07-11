import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { getLogger, Logger } from './Logger';

function captureEntries(): Array<string> {
	const entries: Array<string> = [];
	Logger.register({
		clearLog: () => {},
		exportLog: () => '',
		exportTextFile: () => '',
		getLogFilePath: () => '',
		shareLog: () => {},
		shareTextFile: () => {},
		writeLog: (entry) => entries.push(entry),
	});
	return entries;
}

describe('getLogger', () => {
	let errorSpy: ReturnType<typeof spyOn>;
	let warnSpy: ReturnType<typeof spyOn>;
	let logSpy: ReturnType<typeof spyOn>;

	beforeEach(() => {
		Logger.setEnabled(true);
		errorSpy = spyOn(console, 'error').mockImplementation(() => {});
		warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
		logSpy = spyOn(console, 'log').mockImplementation(() => {});
	});

	afterEach(() => {
		errorSpy.mockRestore();
		warnSpy.mockRestore();
		logSpy.mockRestore();
	});

	it('binds the namespace and tags the level, without a per-call namespace arg', () => {
		const entries = captureEntries();
		const log = getLogger('home');

		log.debug('rendered', { count: 3 });

		expect(entries).toHaveLength(1);
		expect(entries[0]).toContain('[DEBUG]');
		expect(entries[0]).toContain('[home]');
		expect(entries[0]).toContain('rendered');
		expect(entries[0]).toContain('"count":3');
	});

	it('redacts a token embedded in a logged URL data field', () => {
		const entries = captureEntries();
		const log = getLogger('NativeAudioPlayer');

		log.debug('source changed', {
			next: 'https://host/Items/1/Images/Primary?api_key=SECRET&tag=abc',
		});

		expect(entries[0]).not.toContain('SECRET');
		expect(entries[0]).toContain('api_key=<redacted>');
		expect(entries[0]).toContain('tag=abc');
	});

	it('routes each level to its console method', () => {
		captureEntries();
		const log = getLogger('tag');

		log.debug('d');
		log.info('i');
		log.warn('w');
		log.error('e');

		expect(logSpy).toHaveBeenCalledTimes(2);
		expect(warnSpy).toHaveBeenCalledTimes(1);
		expect(errorSpy).toHaveBeenCalledTimes(1);
	});

	it('always writes to the console but not the file when disabled', () => {
		const entries = captureEntries();
		Logger.setEnabled(false);
		const log = getLogger('auth');

		log.debug('trace');
		log.error('connection error', { detail: 'https://host/x?api_key=SECRET' });

		expect(entries).toHaveLength(0);
		expect(logSpy).toHaveBeenCalledTimes(1);
		expect(errorSpy).toHaveBeenCalledTimes(1);
		const consoleArg = String(errorSpy.mock.calls[0][0]);
		expect(consoleArg).not.toContain('SECRET');
		expect(consoleArg).toContain('api_key=<redacted>');
	});

	it('writes to both console and file when enabled', () => {
		const entries = captureEntries();
		const log = getLogger('PlaybackStore');

		log.warn('queue restore: invalid persisted data');

		expect(entries).toHaveLength(1);
		expect(entries[0]).toContain('[WARN]');
		expect(warnSpy).toHaveBeenCalledTimes(1);
	});
});
