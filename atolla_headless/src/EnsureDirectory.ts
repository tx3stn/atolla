// the subset of valdi's file_system this needs, so callers can be tested without the native module
export interface DirectoryFiles {
	createDirectorySync(path: string, createIntermediates: boolean): boolean;
}

// createIntermediates is honoured on macOS and linux-arm64 but ignored on linux-amd64, where
// createDirectorySync creates only the leaf and raises if the parent is missing. Walking the path
// a level at a time works on all three.
export function ensureDirectory(files: DirectoryFiles, directory: string): void {
	let path = directory.startsWith('/') ? '' : '.';

	for (const segment of directory.split('/')) {
		if (segment === '') {
			continue;
		}

		path = `${path}/${segment}`;

		try {
			files.createDirectorySync(path, true);
		} catch {
			// already present, or the write will report it
		}
	}
}
