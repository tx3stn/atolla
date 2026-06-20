import { describe, expect, it } from 'bun:test';
import { DebugLogger } from '../services/DebugLogger';
import { fireAndForget, retryResolve } from './Async';

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
			exportTextFile: () => '',
			getLogFilePath: () => '',
			shareLog: () => {},
			shareTextFile: () => {},
			writeLog: (entry: string) => writes.push(entry),
		});
		DebugLogger.setEnabled(true);

		fireAndForget('label-x', Promise.reject(new Error('kaboom')));
		await new Promise((resolve) => setTimeout(resolve, 0));

		DebugLogger.setEnabled(false);
		expect(writes.some((entry) => entry.includes('label-x'))).toBe(true);
	});
});

describe('retryResolve', () => {
	it('returns the value on first success without retrying', async () => {
		let calls = 0;
		const result = await retryResolve(() => {
			calls += 1;
			return Promise.resolve('ok');
		});
		expect(result).toBe('ok');
		expect(calls).toBe(1);
	});

	it('retries on rejection then resolves', async () => {
		let calls = 0;
		const result = await retryResolve(
			() => {
				calls += 1;
				return calls < 3 ? Promise.reject(new Error('flaky')) : Promise.resolve('recovered');
			},
			{ delayMs: 0 },
		);
		expect(result).toBe('recovered');
		expect(calls).toBe(3);
	});

	it('rethrows the last error after exhausting attempts', async () => {
		let calls = 0;
		let caught: unknown;
		try {
			await retryResolve(
				() => {
					calls += 1;
					return Promise.reject(new Error('always'));
				},
				{ attempts: 2, delayMs: 0 },
			);
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(Error);
		expect((caught as Error).message).toBe('always');
		expect(calls).toBe(2);
	});
});
