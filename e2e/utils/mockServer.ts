import { type ChildProcess, spawn } from 'node:child_process';
import * as path from 'node:path';

// Boots the external Jellyfin-shaped mock (tools/mock-server/serve.ts) for the e2e run and
// tears it down after. serve.ts regenerates the fixtures, starts the media server and wiretap,
// and cleans up its docker container on SIGTERM. We gate readiness on the same sentinel it uses
// (wiretap answers from the spec before the static tree finishes loading — a real fixture proves
// the tree is live).

const GATEWAY = 'http://localhost:9090';
const SENTINEL = `${GATEWAY}/Items?includeItemTypes=MusicAlbum&sortBy=Random`;
const SERVE_SCRIPT = path.resolve('tools/mock-server/serve.ts');

let serverProcess: ChildProcess | undefined;

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
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	return false;
}

export async function startMockServer(): Promise<void> {
	// reuse an already-running instance (a developer running `bun run mock:serve` alongside the
	// tests) so we neither double-bind port 9090 nor kill their server on teardown.
	if (await treeIsLoaded()) {
		console.log('reusing already-running mock server');
		return;
	}

	console.log('starting mock server for e2e run');
	serverProcess = spawn('bun', [SERVE_SCRIPT], { stdio: 'inherit' });

	if (!(await waitUntilReady())) {
		stopMockServer();
		throw new Error('mock server never became ready — is docker running?');
	}
}

export function stopMockServer(): void {
	if (!serverProcess) return;
	serverProcess.kill('SIGTERM');
	serverProcess = undefined;
}
