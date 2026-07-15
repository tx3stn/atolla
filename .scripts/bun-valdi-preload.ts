import { mock } from 'bun:test';
import { join } from 'node:path';

// bun unit tests can't resolve Valdi's path-mapped modules. Point the one runtime
// Valdi import the transport needs (CancelablePromise) at the real file on disk.
const valdiCoreRoot = join(
	import.meta.dir,
	'..',
	'bazel-atolla/external/valdi~/src/valdi_modules/src/valdi/valdi_core',
);

mock.module('valdi_core/src/CancelablePromise', () =>
	require(join(valdiCoreRoot, 'src/CancelablePromise.ts')),
);
