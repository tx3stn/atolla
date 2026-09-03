import { describe, expect, it } from 'bun:test';
import { isErrorConst } from 'atolla_core/src/utils/Errors';
import { type ConfigStore, DEFAULT_DATA_DIR, type PlayerConfig } from '../PlayerConfig';
import { makeTerminal } from '../terminal/Terminal';
import { parseArguments } from './Arguments';
import { CLI_ERROR } from './Errors';
import { CmdPair } from './Pair';

const PATH = '/etc/atolla/player.json';

const CONFIG: PlayerConfig = {
	audioDevice: 'default',
	dataDir: DEFAULT_DATA_DIR,
	language: 'en',
	logLevel: 'info',
	name: 'Kitchen',
	port: 45889,
};

function harness(read: ConfigStore['read'] = () => CONFIG) {
	const stored = new Map<string, string>();
	let next = 0;

	return {
		run: async (argv: Array<string> = []) => {
			const lines: Array<string> = [];
			const exitCode = await CmdPair.run({
				args: parseArguments(argv, CmdPair.flags),
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
			});

			return { exitCode, lines };
		},
		stored,
	};
}

function codeFrom(lines: Array<string>): string | undefined {
	return lines.find((line) => line.startsWith('code: '))?.slice('code: '.length);
}

describe('CmdPair', () => {
	it('rejects naming the config path when no config exists', async () => {
		try {
			await harness(() => undefined).run();
		} catch (error) {
			expect(isErrorConst(error) && error.err === CLI_ERROR.err).toBe(true);
			expect(isErrorConst(error) && error.detail).toContain(PATH);
			return;
		}

		throw new Error('expected a cli error');
	});

	it('prints a grouped code on a stable machine readable line', async () => {
		const { lines } = await harness().run();

		expect(codeFrom(lines)).toMatch(/^\d{4} \d{4}$/);
	});

	it('prints the same code on a second invocation', async () => {
		const pair = harness();

		const first = codeFrom((await pair.run()).lines);
		const second = codeFrom((await pair.run()).lines);

		expect(second).toBe(first);
	});

	it('writes the code under the configured secrets directory', async () => {
		const pair = harness();

		await pair.run();

		expect([...pair.stored.keys()]).toContain(`${DEFAULT_DATA_DIR}/secrets/pairing`);
	});

	it('rotates the code with --reset', async () => {
		const pair = harness();

		const before = codeFrom((await pair.run()).lines);
		const after = codeFrom((await pair.run(['--reset'])).lines);

		expect(after).not.toBe(before);
	});

	it('keeps the rotated code for later invocations', async () => {
		const pair = harness();

		await pair.run();
		const reset = codeFrom((await pair.run(['--reset'])).lines);

		expect(codeFrom((await pair.run()).lines)).toBe(reset);
	});

	it('forgets paired controllers with --reset', async () => {
		const pair = harness();
		await pair.run();
		pair.stored.set(
			`${DEFAULT_DATA_DIR}/secrets/controllers`,
			JSON.stringify([
				{
					controllerId: 'c1',
					controllerName: 'Phone',
					pairedAt: 1756857600000,
					token: 'a3f1c85da3f1c85da3f1c85da3f1c85da3f1c85da3f1c85da3f1c85da3f1c85d',
				},
			]),
		);

		await pair.run(['--reset']);

		expect(
			JSON.parse(pair.stored.get(`${DEFAULT_DATA_DIR}/secrets/controllers`) ?? 'null'),
		).toEqual([]);
	});
});
