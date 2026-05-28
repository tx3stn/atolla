import { describe, expect, it } from 'bun:test';
import { DebugLogger } from '../services/DebugLogger';
import { fireAndForget } from './async';

describe('fireAndForget', () => {
	it('swallows a rejected promise without throwing', async () => {
		expect(() => fireAndForget('test', Promise.reject(new Error('boom')))).not.toThrow();
		// Let the rejection settle; if it were unhandled the runtime would warn.
		await new Promise((resolve) => setTimeout(resolve, 0));
	});

	it('does not interfere with a resolving promise', async () => {
		let ran = false;
		fireAndForget(
			'ok',
			Promise.resolve().then(() => {
				ran = true;
			}),
		);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(ran).toBe(true);
	});

	it('logs the label via DebugLogger when logging is enabled', async () => {
		const writes: Array<string> = [];
		DebugLogger.register({
			clearLog: () => {},
			exportLog: () => '',
			getLogFilePath: () => '',
			shareLog: () => {},
			writeLog: (entry: string) => writes.push(entry),
		});
		DebugLogger.setEnabled(true);

		fireAndForget('label-x', Promise.reject(new Error('kaboom')));
		await new Promise((resolve) => setTimeout(resolve, 0));

		DebugLogger.setEnabled(false);
		expect(writes.some((entry) => entry.includes('label-x'))).toBe(true);
	});
});
