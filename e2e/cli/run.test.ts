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
			JSON.stringify({
				bindAddress: '127.0.0.1',
				dataDir: join(dir, 'data'),
				language: 'en',
				name: 'Kitchen',
				port: PORT,
			}),
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

	// The whole bridge in one assertion: TypeScript built this body and the server serves it.
	it('identifies itself on /hello without a credential', async () => {
		daemon = await cli.run();

		const response = await fetch(`http://127.0.0.1:${PORT}/hello`);

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('application/json');
		expect(await response.json()).toEqual({
			apiVersions: [1],
			id: expect.stringMatching(/^[0-9a-f]{16}$/),
			name: 'Kitchen',
			tier: 'tight',
			v: 1,
			version: expect.any(String),
		});
	});

	// A panic in a connection thread aborts the process.
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

	// 503 means nothing was attached to handle the route and 504 means it never replied, so
	// neither would show the request reaching JavaScript. What it answers is the route's business.
	it('answers a request that has to cross into JavaScript', async () => {
		daemon = await cli.run();

		const response = await fetch(`http://127.0.0.1:${PORT}/pair`, { method: 'POST' });

		expect(response.status).not.toBe(503);
		expect(response.status).not.toBe(504);
		expect(await response.json()).toBeDefined();
	});

	it('stops listening once the daemon exits', async () => {
		daemon = await cli.run();

		await daemon.stop();

		expect(fetch(`http://127.0.0.1:${PORT}/`)).rejects.toThrow();
	});
});
