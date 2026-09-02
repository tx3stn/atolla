import { afterEach, describe, expect, it } from 'bun:test';
import {
	consoleLogWriter,
	getLogger,
	Logger,
	type LogWriter,
} from 'atolla_core/src/services/Logger';
import { filterLogWriter, startDaemon } from './Daemon';
import type { StoreFiles } from './FileKeyValueStore';

const CONFIG = {
	audioDevice: 'default',
	dataDir: '/var/lib/atolla',
	language: 'en',
	logLevel: 'info',
	name: 'Kitchen',
	port: 45889,
} as const;

function capture(): { entries: Array<string>; log: LogWriter } {
	const entries: Array<string> = [];
	return { entries, log: (_level, entry) => entries.push(entry) };
}

function fakeFiles(contents: Map<string, string> = new Map()): StoreFiles {
	return {
		createDirectorySync: () => true,
		readFileSync: (path) => {
			const value = contents.get(path);
			if (value === undefined) {
				throw new Error('no such file');
			}
			return value;
		},
		writeFileSync: (path, data) => {
			contents.set(path, data);
		},
	};
}

describe('filterLogWriter', () => {
	it('writes entries at or above the configured level', () => {
		const entries: Array<string> = [];
		const write = filterLogWriter('warn', (entry) => entries.push(entry));

		write('warn', 'a');
		write('error', 'b');

		expect(entries).toEqual(['a', 'b']);
	});

	it('drops entries below the configured level', () => {
		const entries: Array<string> = [];
		const write = filterLogWriter('warn', (entry) => entries.push(entry));

		write('debug', 'a');
		write('info', 'b');

		expect(entries).toEqual([]);
	});
});

describe('startDaemon', () => {
	afterEach(() => {
		Logger.setWriter(consoleLogWriter);
	});

	it('routes logging from anywhere in the process to the injected writer', async () => {
		const { entries, log } = capture();

		void startDaemon({ config: { ...CONFIG }, files: fakeFiles(), log });
		getLogger('PlaybackStore').warn('queue restore failed');

		expect(entries.some((entry) => entry.includes('[PlaybackStore]'))).toBe(true);
	});

	it('reads persisted state from the configured data directory', async () => {
		const { log } = capture();
		const reads: Array<string> = [];

		void startDaemon({
			config: { ...CONFIG, dataDir: '/mnt/usb/atolla' },
			files: {
				createDirectorySync: () => true,
				readFileSync: (path) => {
					reads.push(path);
					throw new Error('no such file');
				},
				writeFileSync: () => {},
			},
			log,
		});
		await Promise.resolve();

		expect(reads).toContain('/mnt/usb/atolla/state/queue');
	});

	it('returns a promise that does not settle', async () => {
		const { log } = capture();

		const daemon = startDaemon({ config: { ...CONFIG }, files: fakeFiles(), log });
		const settled = await Promise.race([daemon, Promise.resolve('pending')]);

		expect(settled).toBe('pending');
	});
});
