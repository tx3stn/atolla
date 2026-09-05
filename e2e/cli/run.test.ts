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

	it('stops listening once the daemon exits', async () => {
		daemon = await cli.run();

		await daemon.stop();

		expect(fetch(`http://127.0.0.1:${PORT}/`)).rejects.toThrow();
	});
});
