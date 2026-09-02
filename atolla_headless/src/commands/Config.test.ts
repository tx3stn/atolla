import { describe, expect, it } from 'bun:test';
import { isErrorConst } from 'atolla_core/src/utils/Errors';
import { DEFAULT_DATA_DIR, type PlayerConfig } from '../PlayerConfig';
import { makeTerminal } from '../terminal/Terminal';
import { parseArguments } from './Arguments';
import { CmdConfig } from './Config';
import { CLI_ERROR } from './Errors';

const PATH = '/etc/atolla/player.json';

const CONFIG: PlayerConfig = {
	audioDevice: 'default',
	dataDir: DEFAULT_DATA_DIR,
	language: 'en',
	logLevel: 'info',
	name: 'Kitchen',
	port: 45889,
};

function context(argv: Array<string>) {
	const lines: Array<string> = [];
	const written: Array<PlayerConfig> = [];
	let stored: PlayerConfig = { ...CONFIG };

	return {
		context: {
			args: parseArguments(argv, CmdConfig.flags),
			config: {
				path: PATH,
				read: () => stored,
				write: (config: PlayerConfig) => {
					written.push(config);
					stored = config;
				},
			},
			files: { createDirectorySync: () => true, readFileSync: () => '', writeFileSync: () => {} },
			logLevel: CONFIG.logLevel,
			randomBytes: (count: number) => new Uint8Array(count),
			setLanguage: () => {},
			terminal: makeTerminal((text) => lines.push(text.replace(/\n$/, '')), false),
		},
		lines,
		written,
	};
}

describe('CmdConfig', () => {
	it('prints the current configuration when given nothing to change', async () => {
		const { context: ctx, lines, written } = context([]);

		await CmdConfig.run(ctx);

		expect(written).toEqual([]);
		expect(lines.join('\n')).toContain('"port": 45889');
	});

	it('updates the port, leaving every other field alone', async () => {
		const { context: ctx, written } = context(['--port', '45890']);

		await CmdConfig.run(ctx);

		expect(written).toEqual([{ ...CONFIG, port: 45890 }]);
	});

	it('updates the audio device', async () => {
		const { context: ctx, written } = context(['--audio-device', 'hw:2,0']);

		await CmdConfig.run(ctx);

		expect(written).toEqual([{ ...CONFIG, audioDevice: 'hw:2,0' }]);
	});

	it('rejects a port that could not be bound without writing', async () => {
		const { context: ctx, written } = context(['--port', 'http']);

		try {
			await CmdConfig.run(ctx);
		} catch (error) {
			expect(isErrorConst(error) && error.err === CLI_ERROR.err).toBe(true);
			expect(written).toEqual([]);
			return;
		}

		throw new Error('expected a cli error');
	});
});
