// Orchestrates the atolla mock server:
//   1. regenerate the static-mock tree
//   2. start the media server
//   3. start wiretap (pb33f/wiretap in Docker) serving the tree, validated
//      against the Jellyfin OpenAPI spec, proxying media to the upstream
//   4. wait until the whole tree is loaded (wiretap answers from the spec
//      before the static fixtures finish loading — gate on a real fixture)

import { join } from 'node:path';
import { $ } from 'bun';

const HERE = import.meta.dir;
const GENERATED = join(HERE, 'generated');
const SPEC = join(HERE, 'openapi.json');
const MEDIA_PORT = Number(process.env.MOCK_MEDIA_PORT ?? 8788);
const GATEWAY = 'http://localhost:9090';
const CONTAINER = 'atolla-mock';
const SENTINEL = `${GATEWAY}/Items?includeItemTypes=MusicAlbum&sortBy=Random`;

async function removeContainer(): Promise<void> {
	await $`docker rm -f ${CONTAINER}`.nothrow().quiet();
}

async function treeIsLoaded(): Promise<boolean> {
	try {
		const res = await fetch(SENTINEL, { signal: AbortSignal.timeout(3000) });
		if (!res.ok) return false;
		const body = (await res.json()) as { Items?: Array<{ AlbumArtist?: unknown }> };
		const first = body.Items?.[0];
		return typeof first?.AlbumArtist === 'string';
	} catch {
		return false;
	}
}

async function waitUntilReady(): Promise<boolean> {
	for (let attempt = 0; attempt < 120; attempt++) {
		if (await treeIsLoaded()) return true;
		await Bun.sleep(500);
	}
	return false;
}

console.log('generating fixtures');
await $`bun ${join(HERE, 'generate.ts')}`;

const media = Bun.spawn(['bun', join(HERE, 'media-server.ts')], {
	env: { ...process.env, MOCK_MEDIA_PORT: String(MEDIA_PORT) },
	stderr: 'inherit',
	stdout: 'inherit',
});

await removeContainer();
console.log('starting wiretap');
const wiretap = Bun.spawn(
	[
		'docker',
		'run',
		'--rm',
		'--name',
		CONTAINER,
		'-p',
		'9090:9090',
		'-v',
		`${GENERATED}:/mocks`,
		'-v',
		`${SPEC}:/spec/jellyfin.json`,
		'pb33f/wiretap',
		'--static-mock-dir',
		'/mocks',
		'--spec',
		'/spec/jellyfin.json',
		'--url',
		`http://host.docker.internal:${MEDIA_PORT}`,
	],
	{ stderr: 'inherit', stdout: 'inherit' },
);

let shuttingDown = false;
async function shutdown(): Promise<void> {
	if (shuttingDown) return;
	shuttingDown = true;
	await removeContainer();
	media.kill();
	process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

if (!(await waitUntilReady())) {
	console.error('\nmock server never became ready — is docker running?');
	await shutdown();
}

console.log('\n  ✓ atolla mock server ready');
console.log('      android emulator : http://10.0.2.2:9090');
console.log('      iOS simulator    : http://localhost:9090');

await wiretap.exited;
await shutdown();
