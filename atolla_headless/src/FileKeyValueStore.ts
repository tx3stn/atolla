import type { KeyValueStore } from 'atolla_core/src/stores/KeyValueStore';
import { ensureDirectory } from './EnsureDirectory';

export interface StoreFiles {
	createDirectorySync(path: string, createIntermediates: boolean): boolean;
	readFileSync(path: string, options?: { encoding?: 'utf8' }): string | ArrayBuffer;
	writeFileSync(path: string, data: string): void;
}

export interface FileKeyValueStore extends KeyValueStore {
	pathFor: (key: string) => string;
}

export function makeFileKeyValueStore(files: StoreFiles, directory: string): FileKeyValueStore {
	const pathFor = (key: string) => `${directory}/${key}`;

	return {
		fetchString: (key) => {
			try {
				return Promise.resolve(files.readFileSync(pathFor(key), { encoding: 'utf8' }) as string);
			} catch {
				return Promise.reject(new Error(`no value stored for ${key}`));
			}
		},
		pathFor,
		// ensureDirectory reports nothing, so the write is what decides success
		storeString: (key, value) => {
			ensureDirectory(files, directory);

			try {
				files.writeFileSync(pathFor(key), value);
			} catch (error) {
				return Promise.reject(error);
			}

			return Promise.resolve();
		},
	};
}
