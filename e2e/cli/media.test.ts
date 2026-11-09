import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { PairAccepted } from 'atolla_sync/src/api/generated';
import { PlayerClient } from 'atolla_sync/src/api/PlayerClient';
import { Cli, type Daemon, pairingCode } from './cli';
import { FetchTransport } from './transport';

// away from the 45889 default and from the sibling suites, so neither a daemon left running on
// this machine nor another spec can make these pass
const PORT = 45995;

const CACHE_BYTES = 1000;

describe('PUT /media/{trackId}', () => {
	let daemon: Daemon;
	let dataDir: string;
	let dir: string;
	let token: string;

	function upload(trackId: string, bytes: Uint8Array<ArrayBuffer>): Promise<Response> {
		return fetch(`http://127.0.0.1:${PORT}/media/${trackId}`, {
			body: bytes,
			headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
			method: 'PUT',
		});
	}

	beforeEach(async () => {
		dir = mkdtempSync(join(tmpdir(), 'atolla-cli-'));
		dataDir = join(dir, 'data');
		const configPath = join(dir, 'etc', 'player.json');

		mkdirSync(dirname(configPath), { recursive: true });
		writeFileSync(
			configPath,
			JSON.stringify({
				bindAddress: '127.0.0.1',
				dataDir,
				language: 'en',
				mediaCacheGb: CACHE_BYTES / 1_000_000_000,
				name: 'Kitchen',
				port: PORT,
			}),
		);

		const cli = new Cli({ config: configPath });
		const code = pairingCode(cli.pair().stdout);
		daemon = await cli.run();

		const client = new PlayerClient(`http://127.0.0.1:${PORT}`, new FetchTransport());
		const paired = await client.pair({ code, controllerId: 'phone-1', controllerName: 'pixel 8' });
		token = (paired.json as PairAccepted).token;
	});

	afterEach(async () => {
		await daemon.stop();
		rmSync(dir, { force: true, recursive: true });
	});

	it('keeps the file in the media directory under its track id', async () => {
		const bytes = new Uint8Array([1, 2, 3, 4, 5]);

		const answer = await upload('track-1', bytes);

		expect(answer.status).toBe(201);
		expect(new Uint8Array(readFileSync(join(dataDir, 'media', 'track-1')))).toEqual(bytes);
	});

	it('refuses a file larger than the media cache set in the config file', async () => {
		const answer = await upload('track-1', new Uint8Array(CACHE_BYTES + 1));

		expect(answer.status).toBe(413);
	});
});
