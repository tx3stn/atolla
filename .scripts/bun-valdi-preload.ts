import { mock } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// bun unit tests can't resolve Valdi's path-mapped modules. Read the mapping out of
// the projectsync-generated tsconfig rather than hardcoding it: the bazel-<workspace>
// symlink name and the bzlmod canonical repo name (valdi~ / valdi+) differ per machine.
const tsconfigDir = join(import.meta.dir, '..', 'atolla');
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

mock.module(new URL('../atolla/src/Strings', import.meta.url).href, () => ({
	default: new Proxy({}, { get: (_, key) => () => String(key) }),
}));
