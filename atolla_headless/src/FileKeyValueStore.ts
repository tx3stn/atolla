import type { KeyValueStore } from 'atolla_core/src/stores/KeyValueStore';

export interface StoreFiles {
	createDirectorySync(path: string, createIntermediates: boolean): boolean;
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
		// writeFileSync creates the parent directory on macOS and linux-arm64 but not on linux-amd64,
		// and createDirectorySync raises on linux-amd64 when the directory is already there, so the
		// write is what decides success
		storeString: (key, value) => {
			try {
				files.createDirectorySync(directory, true);
			} catch {
				// already present
			}

			try {
				files.writeFileSync(`${directory}/${key}`, value);
			} catch (error) {
				return Promise.reject(error);
			}

			return Promise.resolve();
		},
	};
}
