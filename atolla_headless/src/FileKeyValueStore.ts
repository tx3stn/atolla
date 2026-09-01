import type { KeyValueStore } from 'atolla_core/src/stores/KeyValueStore';

export interface StoreFiles {
	readFileSync(path: string, options?: { encoding?: 'utf8' }): string | ArrayBuffer;
	writeFileSync(path: string, data: string): void;
}

export function makeFileKeyValueStore(files: StoreFiles, directory: string): KeyValueStore {
	return {
		fetchString: (key) => {
			try {
				return Promise.resolve(
					files.readFileSync(`${directory}/${key}`, { encoding: 'utf8' }) as string,
				);
			} catch {
				return Promise.reject(new Error(`no value stored for ${key}`));
			}
		},
		storeString: (key, value) => {
			try {
				files.writeFileSync(`${directory}/${key}`, value);
			} catch (error) {
				return Promise.reject(error);
			}

			return Promise.resolve();
		},
	};
}
