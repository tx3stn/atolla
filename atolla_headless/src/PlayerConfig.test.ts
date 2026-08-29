import { describe, expect, it } from 'bun:test';
import { isErrorConst } from 'atolla_core/src/utils/Errors';
import { CLI_ERROR } from './commands/Errors';
import { type ConfigFiles, makeConfigStore, type PlayerConfig } from './PlayerConfig';

const PATH = '/etc/atolla/player.json';

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

		expect(makeConfigStore(files, PATH).read()).toEqual({ language: 'fr', name: 'kitchen' });
	});

	it('falls back per field rather than rejecting the whole file', () => {
		const { files } = fakeFiles('{"language":"martian"}');

		expect(makeConfigStore(files, PATH).read()).toEqual({ language: 'en', name: '' });
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

		makeConfigStore(files, PATH).write({ language: 'en', name: 'living room' });

		expect(directories).toEqual(['/etc/atolla']);
	});

	it('round-trips through read', () => {
		const { files } = fakeFiles();
		const store = makeConfigStore(files, PATH);
		const config: PlayerConfig = { language: 'fr', name: 'bedroom' };

		store.write(config);

		expect(store.read()).toEqual(config);
	});

	it('writes newline-terminated json so the file edits cleanly by hand', () => {
		const { files, written } = fakeFiles();

		makeConfigStore(files, PATH).write({ language: 'en', name: 'hall' });

		expect(written[0][1].endsWith('\n')).toBe(true);
	});
});
