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
	return {
		args: parseArguments([], CmdRun.flags),
		config: { path: PATH, read, write: () => {} },
		files: { readFileSync: () => '', writeFileSync: () => {} },
		logLevel: CONFIG.logLevel,
		setLanguage: () => {},
		terminal: makeTerminal((text) => lines.push(text.replace(/\n$/, '')), false),
	};
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

		expect(lines.some((line) => line.includes('hw:2,0'))).toBe(true);
		expect(lines.some((line) => line.includes('http://0.0.0.0:45890'))).toBe(true);
	});
});
