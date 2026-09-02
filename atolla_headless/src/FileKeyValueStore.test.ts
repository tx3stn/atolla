import { describe, expect, it } from 'bun:test';
import { makeFileKeyValueStore, type StoreFiles } from './FileKeyValueStore';

const DIR = '/var/lib/atolla/state';

function fakeFiles(): StoreFiles {
	const contents = new Map<string, string>();

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

describe('makeFileKeyValueStore', () => {
	it('rejects for a key that was never written', () => {
		expect(makeFileKeyValueStore(fakeFiles(), DIR).fetchString('queue')).rejects.toThrow();
	});

	it('keeps values for different keys separate', async () => {
		const store = makeFileKeyValueStore(fakeFiles(), DIR);

		await store.storeString('queue', 'q');
		await store.storeString('progress', 'p');

		expect(await store.fetchString('queue')).toBe('q');
		expect(await store.fetchString('progress')).toBe('p');
	});

	it('creates the directory before writing, so a fresh install can persist', async () => {
		const created: Array<string> = [];
		const files = { ...fakeFiles(), createDirectorySync: (path: string) => created.push(path) > 0 };

		await makeFileKeyValueStore(files, DIR).storeString('queue', 'q');

		expect(created).toEqual([DIR]);
	});

	it('still writes when the directory is already there', async () => {
		const files = {
			...fakeFiles(),
			createDirectorySync: () => {
				throw new Error('Could not create directory');
			},
		};
		const store = makeFileKeyValueStore(files, DIR);

		await store.storeString('queue', 'q');

		expect(await store.fetchString('queue')).toBe('q');
	});

	it('rejects rather than throwing when the write fails', async () => {
		const files = {
			...fakeFiles(),
			writeFileSync: () => {
				throw new Error('read-only file system');
			},
		};

		expect(makeFileKeyValueStore(files, DIR).storeString('queue', 'q')).rejects.toThrow();
	});
});
