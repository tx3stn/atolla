import { afterEach, describe, expect, it } from 'bun:test';
import { consoleLogWriter, Logger } from 'atolla_core/src/services/Logger';
import { isErrorConst } from 'atolla_core/src/utils/Errors';
import { type ConfigStore, DEFAULT_DATA_DIR, type PlayerConfig } from '../PlayerConfig';
import { makeTerminal } from '../terminal/Terminal';
import { parseArguments } from './Arguments';
import { CLI_ERROR } from './Errors';
import { CmdRun } from './Run';

const PATH = '/etc/atolla/player.json';

const CONFIG: PlayerConfig = {
	audioDevice: 'default',
	dataDir: DEFAULT_DATA_DIR,
	language: 'en',
	logLevel: 'info',
	name: 'Kitchen',
	port: 45889,
};

function context(read: ConfigStore['read'], lines: Array<string> = []) {
	const stored = new Map<string, string>();
	let next = 0;

	return {
		args: parseArguments([], CmdRun.flags),
		config: { path: PATH, read, write: () => {} },
		files: {
			createDirectorySync: () => true,
			readFileSync: (path: string) => {
				const value = stored.get(path);
				if (value === undefined) {
					throw new Error('no such file');
				}
				return value;
			},
			writeFileSync: (path: string, data: string) => {
				stored.set(path, data);
			},
		},
		logLevel: CONFIG.logLevel,
		randomBytes: (count: number) => Uint8Array.from({ length: count }, () => next++ & 0xff),
		setLanguage: () => {},
		terminal: makeTerminal((text) => lines.push(text.replace(/\n$/, '')), false),
	};
}

function flush(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('CmdRun', () => {
	afterEach(() => {
		Logger.setWriter(consoleLogWriter);
	});

	it('rejects naming the config path when no config exists', async () => {
		try {
			await CmdRun.run(context(() => undefined));
		} catch (error) {
			expect(isErrorConst(error) && error.err === CLI_ERROR.err).toBe(true);
			expect(isErrorConst(error) && error.detail).toContain(PATH);
			return;
		}

		throw new Error('expected a cli error');
	});

	it('banners the configured audio device and control port', async () => {
		const lines: Array<string> = [];

		void CmdRun.run(context(() => ({ ...CONFIG, audioDevice: 'hw:2,0', port: 45890 }), lines));
		await flush();

		expect(lines.some((line) => line.includes('hw:2,0'))).toBe(true);
		expect(lines.some((line) => line.includes('http://0.0.0.0:45890'))).toBe(true);
	});

	it('banners the real player id rather than a placeholder', async () => {
		const lines: Array<string> = [];

		void CmdRun.run(context(() => CONFIG, lines));
		await flush();

		expect(lines.some((line) => /\b[0-9a-f]{16}\b/.test(line))).toBe(true);
	});

	it('banners a controller count of zero before anything has paired', async () => {
		const lines: Array<string> = [];

		void CmdRun.run(context(() => CONFIG, lines));
		await flush();

		expect(lines.some((line) => /fieldControllers\s+0$/.test(line))).toBe(true);
	});

	it('reuses the player id persisted under the configured data directory', async () => {
		const first: Array<string> = [];
		const second: Array<string> = [];
		const shared = context(() => CONFIG, first);

		void CmdRun.run(shared);
		await flush();
		void CmdRun.run({ ...shared, terminal: makeTerminal((text) => second.push(text), false) });
		await flush();

		const id = (line: Array<string>) => line.join('').match(/\b[0-9a-f]{16}\b/)?.[0];
		expect(id(second)).toBe(id(first));
	});
});
