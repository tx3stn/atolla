import { mock } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// bun unit tests can't resolve Valdi's path-mapped modules. Read the mapping out of
// the projectsync-generated tsconfig rather than hardcoding it: the bazel-<workspace>
// symlink name and the bzlmod canonical repo name (valdi~ / valdi+) differ per machine.
const tsconfigDir = join(import.meta.dir, '..', 'atolla_core');
const tsconfigPath = join(tsconfigDir, 'tsconfig.json');

let tsconfig: { compilerOptions: { paths: Record<string, Array<string>> } };
try {
	tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8'));
} catch {
	throw new Error(`${tsconfigPath} is missing — run \`bunx valdi projectsync\` first.`);
}

const valdiCoreRoot = resolve(
	tsconfigDir,
	tsconfig.compilerOptions.paths['valdi_core/*'][0].replace(/\/\*$/, ''),
);

mock.module('valdi_core/src/CancelablePromise', () =>
	require(join(valdiCoreRoot, 'src/CancelablePromise.ts')),
);

// Strings is generated into the module by valdi from strings_dir, so no file exists on
// disk for bun to resolve. Register the bare cross-module specifier as well as the file
// URL: bun's tsconfig `paths` resolution stats the target before consulting the mock
// registry, so the URL form alone only covers importers inside atolla_core.
const stringsProxy = () => ({
	default: new Proxy({}, { get: (_, key) => () => String(key) }),
});

mock.module('atolla_core/src/Strings', stringsProxy);
mock.module(new URL('../atolla_core/src/Strings', import.meta.url).href, stringsProxy);
