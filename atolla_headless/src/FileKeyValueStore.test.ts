import { describe, expect, it } from 'bun:test';
import { makeFileKeyValueStore, type StoreFiles } from './FileKeyValueStore';

const DIR = '/var/lib/atolla/state';

function fakeFiles(): StoreFiles {
	const contents = new Map<string, string>();

	return {
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
});
