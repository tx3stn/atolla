import { afterEach, describe, expect, it } from 'bun:test';
import {
	consoleLogWriter,
	getLogger,
	Logger,
	type LogWriter,
} from 'atolla_core/src/services/Logger';
import { startDaemon } from './Daemon';

const CONFIG = { language: 'en', name: 'Kitchen' } as const;

function capture(): { entries: Array<string>; log: LogWriter } {
	const entries: Array<string> = [];
	return { entries, log: (_level, entry) => entries.push(entry) };
}

describe('startDaemon', () => {
	afterEach(() => {
		Logger.setWriter(consoleLogWriter);
	});

	it('routes logging from anywhere in the process to the injected writer', () => {
		const { entries, log } = capture();

		startDaemon({ config: { ...CONFIG }, log });
		getLogger('PlaybackStore').warn('queue restore failed');

		expect(entries.some((entry) => entry.includes('[PlaybackStore]'))).toBe(true);
	});

	it('returns a promise that does not settle', async () => {
		const { log } = capture();

		const daemon = startDaemon({ config: { ...CONFIG }, log });
		const settled = await Promise.race([daemon, Promise.resolve('pending')]);

		expect(settled).toBe('pending');
	});
});
