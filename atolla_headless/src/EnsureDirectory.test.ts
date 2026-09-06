import { describe, expect, it } from 'bun:test';
import { type DirectoryFiles, ensureDirectory } from './EnsureDirectory';

// Stands in for linux-amd64, where createDirectorySync ignores createIntermediates and raises
// unless the parent is already there.
function leafOnlyFiles(existing: Array<string> = []): DirectoryFiles & { created: Array<string> } {
	const present = new Set(existing);
	const created: Array<string> = [];

	return {
		createDirectorySync: (path) => {
			if (present.has(path)) {
				throw new Error('file exists');
			}

			const parent = path.substring(0, path.lastIndexOf('/'));
			if (parent !== '' && parent !== '.' && !present.has(parent)) {
				throw new Error('no such file or directory');
			}

			present.add(path);
			created.push(path);

			return true;
		},
		created,
	};
}

describe('ensureDirectory', () => {
	it('builds every missing level, so a fresh install can persist', () => {
		const files = leafOnlyFiles(['/var']);

		ensureDirectory(files, '/var/lib/atolla/secrets');

		expect(files.created).toEqual(['/var/lib', '/var/lib/atolla', '/var/lib/atolla/secrets']);
	});

	it('leaves a directory that is already there alone', () => {
		const files = leafOnlyFiles(['/var', '/var/lib', '/var/lib/atolla']);

		expect(() => ensureDirectory(files, '/var/lib/atolla')).not.toThrow();
	});

	it('creates a relative directory without reaching for the root', () => {
		const files = leafOnlyFiles();

		ensureDirectory(files, 'data/secrets');

		expect(files.created).toEqual(['./data', './data/secrets']);
	});

	it('swallows a failure at every level, so the write decides success', () => {
		const files: DirectoryFiles = {
			createDirectorySync: () => {
				throw new Error('read-only file system');
			},
		};

		expect(() => ensureDirectory(files, '/var/lib/atolla')).not.toThrow();
	});
});
