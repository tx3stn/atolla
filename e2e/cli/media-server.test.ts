import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { MediaServer, PairAccepted, StateSnapshot } from 'atolla_sync/src/api/generated';
import { PlayerClient } from 'atolla_sync/src/api/PlayerClient';
import { Cli, type Daemon, pairingCode } from './cli';
import { FetchTransport } from './transport';

// away from the 45889 default and from the sibling suites, so neither a daemon left running on
// this machine nor another spec can make these pass
const PORT = 45994;

const ACCESS_TOKEN = '3d9f0c1b7a5e4826aa11bb22cc33dd44';

const SERVER_ID = '7e0a5b9c2d4f8613';

function credential(userId: string, overrides: Partial<MediaServer> = {}): MediaServer {
	return {
		accessToken: `${ACCESS_TOKEN}-${userId}`,
		baseUrl: 'http://jellyfin.local:8096',
		deviceId: `atolla-4f3c9a1de8b27065-${userId}`,
		serverId: SERVER_ID,
		userId,
		...overrides,
	};
}

function filesUnder(directory: string): Array<string> {
	const found: Array<string> = [];

	for (const entry of readdirSync(directory)) {
		const path = join(directory, entry);

		if (statSync(path).isDirectory()) {
			found.push(...filesUnder(path));
		} else {
			found.push(path);
		}
	}

	return found;
}

describe('PUT /media-server', () => {
	let cli: Cli;
	let client: PlayerClient;
	let code: string;
	let daemon: Daemon;
	let dataDir: string;
	let dir: string;
	let token: string;

	async function provisioned(): Promise<Array<string>> {
		const answer = await client.state(token);
		const snapshot = answer.json as StateSnapshot;

		return snapshot.sourceHealth?.mediaServerUsers ?? [];
	}

	async function pair(): Promise<void> {
		code = pairingCode(cli.pair().stdout);
		daemon = await cli.run();
		client = new PlayerClient(`http://127.0.0.1:${PORT}`, new FetchTransport());

		const paired = await client.pair({ code, controllerId: 'phone-1', controllerName: 'pixel 8' });
		token = (paired.json as PairAccepted).token;
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
				name: 'Kitchen',
				port: PORT,
			}),
		);

		cli = new Cli({ config: configPath });
		await pair();
	});

	afterEach(async () => {
		await daemon.stop();
		rmSync(dir, { force: true, recursive: true });
	});

	// `POST /pair` provisions in one step, so the push is for a player that is already paired.
	it('holds a credential the pairing itself carried', async () => {
		await client.pair({
			code,
			controllerId: 'phone-2',
			controllerName: 'pixel 9',
			mediaServer: credential('u1'),
		});

		expect(await provisioned()).toEqual(['u1']);
	});

	it('holds a pushed credential and says so in the snapshot', async () => {
		const answer = await client.mediaServer(token, credential('u1'));

		expect(answer.status).toBe(200);
		expect(await provisioned()).toEqual(['u1']);
	});

	it('answers a version the controller can long poll from', async () => {
		const before = ((await client.state(token)).json as StateSnapshot).version;

		const answer = await client.mediaServer(token, credential('u1'));

		expect((answer.json as { version: number }).version).toBeGreaterThan(before);
	});

	it('lets a second household member provision the same player', async () => {
		await client.mediaServer(token, credential('u1'));
		const answer = await client.mediaServer(token, credential('u2'));

		expect(answer.status).toBe(200);
		expect(await provisioned()).toEqual(['u1', 'u2']);
	});

	it('refuses a push naming a different server', async () => {
		await client.mediaServer(token, credential('u1'));

		const answer = await client.mediaServer(token, credential('u2', { serverId: 'elsewhere' }));

		expect(answer.status).toBe(409);
		expect(answer.json).toMatchObject({ code: 'media_server_id_mismatch' });
		expect(await provisioned()).toEqual(['u1']);
	});

	// Two controllers reach one server by different names, which is why the comparison is on the
	// server id rather than the address.
	it('accepts the same server reached at another address', async () => {
		await client.mediaServer(token, credential('u1'));

		const answer = await client.mediaServer(token, {
			...credential('u2'),
			baseUrl: 'http://192.168.1.50:8096',
		});

		expect(answer.status).toBe(200);
		expect(await provisioned()).toEqual(['u1', 'u2']);
	});

	it('refuses a push presenting no controller token', async () => {
		const answer = await client.mediaServer('0'.repeat(64), credential('u1'));

		expect(answer.status).toBe(401);
		expect(await provisioned()).toEqual([]);
	});

	it('refuses a body missing a member it needs', async () => {
		const { serverId, ...incomplete } = credential('u1');
		const answer = await client.mediaServer(token, incomplete as MediaServer);

		expect(answer.status).toBe(400);
		expect(answer.json).toMatchObject({ code: 'malformed_body' });
		expect(await provisioned()).toEqual([]);
	});

	it('holds nothing across a restart, and takes the credential back', async () => {
		await client.mediaServer(token, credential('u1'));
		await daemon.stop();

		daemon = await cli.run();
		expect(await provisioned()).toEqual([]);

		await client.mediaServer(token, credential('u1'));
		expect(await provisioned()).toEqual(['u1']);
	});

	it('writes no part of the credential to disk or to its log', async () => {
		await client.mediaServer(token, credential('u1'));
		await client.command(token, {
			command: 'setQueue',
			trackIndex: 0,
			tracks: [{ duration: 1, id: 'tone1', name: 'tone one' }],
			userId: 'u1',
		});
		await client.state(token);

		for (const path of filesUnder(dataDir)) {
			expect(readFileSync(path, 'utf8')).not.toContain(ACCESS_TOKEN);
		}

		expect(daemon.output()).not.toContain(ACCESS_TOKEN);
	});

	it('keeps the queue owner across a restart', async () => {
		await client.mediaServer(token, credential('u1'));
		await client.command(token, {
			command: 'setQueue',
			trackIndex: 0,
			tracks: [{ duration: 1, id: 'tone1', name: 'tone one' }],
			userId: 'u1',
		});

		expect(readFileSync(join(dataDir, 'state', 'queue_owner'), 'utf8')).toBe('u1');

		await daemon.stop();
		daemon = await cli.run();

		const snapshot = (await client.state(token)).json as StateSnapshot;
		expect(snapshot.queue.owner).toBe('u1');
	});
});
