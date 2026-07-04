import { beforeEach, describe, expect, it } from 'bun:test';
import { DebugLogger } from './DebugLogger';

function captureEntries(): Array<string> {
	const entries: Array<string> = [];
	DebugLogger.register({
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

describe('DebugLogger', () => {
	beforeEach(() => {
		DebugLogger.setEnabled(true);
	});

	it('redacts a token embedded in a logged URL data field', () => {
		const entries = captureEntries();

		DebugLogger.log('NativeAudioPlayer', 'source changed', {
			next: 'https://host/Items/1/Images/Primary?api_key=SECRET&tag=abc',
		});

		expect(entries).toHaveLength(1);
		expect(entries[0]).not.toContain('SECRET');
		expect(entries[0]).toContain('api_key=<redacted>');
		expect(entries[0]).toContain('tag=abc');
	});

	it('does not log when disabled', () => {
		const entries = captureEntries();
		DebugLogger.setEnabled(false);

		DebugLogger.log('tag', 'message');

		expect(entries).toHaveLength(0);
	});
});
