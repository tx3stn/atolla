import { describe, expect, it } from 'bun:test';
import { isErrorConst } from 'atolla_core/src/utils/Errors';
import { CLI_ERROR } from './commands/Errors';
import {
	type ConfigFiles,
	DEFAULT_AUDIO_DEVICE,
	DEFAULT_DATA_DIR,
	DEFAULT_LOG_LEVEL,
	DEFAULT_PORT,
	makeConfigStore,
	type PlayerConfig,
	readLogLevel,
	readPort,
} from './PlayerConfig';

const PATH = '/etc/atolla/player.json';

const CONFIG: PlayerConfig = {
	audioDevice: DEFAULT_AUDIO_DEVICE,
	dataDir: DEFAULT_DATA_DIR,
	language: 'en',
	logLevel: DEFAULT_LOG_LEVEL,
	name: 'kitchen',
	port: DEFAULT_PORT,
};

function fakeFiles(initial?: string) {
	const written: Array<[string, string]> = [];
	const directories: Array<string> = [];
	let contents = initial;

	const files: ConfigFiles = {
		createDirectorySync: (path) => {
			directories.push(path);
			return true;
		},
		readFileSync: (path) => {
			if (path !== PATH || contents === undefined) {
				throw new Error('no such file');
			}
			return contents;
		},
		writeFileSync: (path, data) => {
			written.push([path, data]);
			contents = data;
		},
	};

	return { directories, files, written };
}

describe('makeConfigStore read', () => {
	it('returns undefined when the file is absent', () => {
		const { files } = fakeFiles();

		expect(makeConfigStore(files, PATH).read()).toBeUndefined();
	});

	it('reads the stored language and name', () => {
		const { files } = fakeFiles('{"language":"fr","name":"kitchen"}');

		expect(makeConfigStore(files, PATH).read()).toEqual({ ...CONFIG, language: 'fr' });
	});

	it('reads the stored daemon fields', () => {
		const { files } = fakeFiles(
			'{"audioDevice":"hw:2,0","logLevel":"debug","name":"kitchen","port":45890}',
		);

		expect(makeConfigStore(files, PATH).read()).toEqual({
			...CONFIG,
			audioDevice: 'hw:2,0',
			logLevel: 'debug',
			port: 45890,
		});
	});

	it('falls back per field rather than rejecting the whole file', () => {
		const { files } = fakeFiles('{"language":"martian"}');

		expect(makeConfigStore(files, PATH).read()).toEqual({ ...CONFIG, name: '' });
	});

	it('falls back on a port that could not be bound', () => {
		for (const port of ['"45890"', '45890.5', '0', '70000']) {
			const { files } = fakeFiles(`{"name":"kitchen","port":${port}}`);

			expect(makeConfigStore(files, PATH).read()?.port).toBe(DEFAULT_PORT);
		}
	});

	it('falls back on an unrecognised log level', () => {
		const { files } = fakeFiles('{"logLevel":"chatty","name":"kitchen"}');

		expect(makeConfigStore(files, PATH).read()?.logLevel).toBe(DEFAULT_LOG_LEVEL);
	});

	it('respects a data directory the operator has set by hand', () => {
		const { files } = fakeFiles('{"dataDir":"/mnt/usb/atolla","language":"en","name":"kitchen"}');

		expect(makeConfigStore(files, PATH).read()?.dataDir).toBe('/mnt/usb/atolla');
	});

	it('reports a file that exists but cannot be parsed', () => {
		const { files } = fakeFiles('not json');

		try {
			makeConfigStore(files, PATH).read();
		} catch (error) {
			expect(isErrorConst(error) && error.err === CLI_ERROR.err).toBe(true);
			expect(isErrorConst(error) && error.detail).toContain(PATH);
			return;
		}

		throw new Error('expected a cli error');
	});
});

describe('makeConfigStore write', () => {
	it('creates the containing directory before writing', () => {
		const { directories, files } = fakeFiles();

		makeConfigStore(files, PATH).write({ ...CONFIG, name: 'living room' });

		expect(directories).toEqual(['/etc/atolla']);
	});

	it('round-trips through read', () => {
		const { files } = fakeFiles();
		const store = makeConfigStore(files, PATH);
		const config: PlayerConfig = {
			...CONFIG,
			audioDevice: 'hw:2,0',
			language: 'fr',
			logLevel: 'warn',
			name: 'bedroom',
			port: 45890,
		};

		store.write(config);

		expect(store.read()).toEqual(config);
	});

	it('writes newline-terminated json so the file edits cleanly by hand', () => {
		const { files, written } = fakeFiles();

		makeConfigStore(files, PATH).write({ ...CONFIG, name: 'hall' });

		expect(written[0][1].endsWith('\n')).toBe(true);
	});
});

describe('readPort', () => {
	it('accepts a port a socket could bind', () => {
		expect(readPort('45890')).toBe(45890);
	});

	it('rejects anything that is not a whole number in range, naming the value', () => {
		for (const value of ['', 'http', '45890.5', '0', '65536']) {
			try {
				readPort(value);
			} catch (error) {
				expect(isErrorConst(error) && error.err === CLI_ERROR.err).toBe(true);
				expect(isErrorConst(error) && error.detail).toContain(value);
				continue;
			}

			throw new Error(`expected a cli error for ${value}`);
		}
	});
});

describe('readLogLevel', () => {
	it('accepts a level the logger writes', () => {
		expect(readLogLevel('warn')).toBe('warn');
	});

	it('rejects an unknown level, naming it', () => {
		try {
			readLogLevel('chatty');
		} catch (error) {
			expect(isErrorConst(error) && error.err === CLI_ERROR.err).toBe(true);
			expect(isErrorConst(error) && error.detail).toContain('chatty');
			return;
		}

		throw new Error('expected a cli error');
	});
});
