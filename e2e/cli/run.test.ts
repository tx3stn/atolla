import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Cli, type Daemon } from './cli';

// away from the 45889 default, so a daemon left running on this machine cannot make these pass
const PORT = 45991;

describe('atolla run', () => {
	let cli: Cli;
	let daemon: Daemon | undefined;
	let dir: string;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'atolla-cli-'));
		const configPath = join(dir, 'etc', 'player.json');

		mkdirSync(dirname(configPath), { recursive: true });
		writeFileSync(
			configPath,
			JSON.stringify({ dataDir: join(dir, 'data'), language: 'en', name: 'Kitchen', port: PORT }),
		);

		cli = new Cli({ config: configPath });
	});

	afterEach(async () => {
		await daemon?.stop();
		daemon = undefined;
		rmSync(dir, { force: true, recursive: true });
	});

	it('serves the control port it was configured with', async () => {
		daemon = await cli.run();

		const response = await fetch(`http://127.0.0.1:${PORT}/`);

		expect(response.status).toBe(404);
	});

	it('keeps serving after a request', async () => {
		daemon = await cli.run();

		await fetch(`http://127.0.0.1:${PORT}/one`);
		const second = await fetch(`http://127.0.0.1:${PORT}/two`);

		expect(second.status).toBe(404);
	});

	// the whole bridge in one assertion: TypeScript built this body from the stored identity and
	// handed it to the server as bytes
	it('identifies itself on /hello without a credential', async () => {
		daemon = await cli.run();

		const response = await fetch(`http://127.0.0.1:${PORT}/hello`);

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('application/json');
		expect(await response.json()).toEqual({
			id: expect.stringMatching(/^[0-9a-f]{16}$/),
			name: 'Kitchen',
			protocolVersions: [1],
			tier: 'tight',
			v: 1,
			version: expect.any(String),
		});
	});

	// a panic in a connection thread aborts the process, so anything reachable from the LAN
	// must be answerable without taking the daemon down
	it('keeps running after requests it has no route for', async () => {
		daemon = await cli.run();

		const hostile: Array<RequestInit> = [
			{ method: 'POST' },
			{ method: 'PUT' },
			{ method: 'DELETE' },
			{ headers: { Expect: '100-continue' }, method: 'POST' },
			{ body: 'x', headers: { 'Transfer-Encoding': 'chunked' }, method: 'POST' },
		];

		for (const init of hostile) {
			await fetch(`http://127.0.0.1:${PORT}/hello`, init).catch(() => undefined);
		}

		const response = await fetch(`http://127.0.0.1:${PORT}/hello`);

		expect(response.status).toBe(200);
	});

	it('stops listening once the daemon exits', async () => {
		daemon = await cli.run();

		await daemon.stop();

		expect(fetch(`http://127.0.0.1:${PORT}/`)).rejects.toThrow();
	});
});
