import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { PairAccepted, PairRequest, Problem } from 'atolla_sync/src/api/generated';
import { type PlayerAnswer, PlayerClient } from 'atolla_sync/src/api/PlayerClient';
import type { PendingRequest } from 'atolla_sync/src/api/Transport';
import { Cli, type Daemon, pairingCode } from './cli';
import { FetchTransport } from './transport';

// away from the 45889 default and from run.test.ts, so neither a daemon left running on this
// machine nor a sibling suite can make these pass
const PORT = 45992;

const MEDIA_SERVER = {
	accessToken: '3d9f0c1b7a5e4826',
	baseUrl: 'http://jellyfin.local:8096',
	deviceId: 'atolla-kitchen',
	userId: '8b1f2c3d4e5f6071',
};

type Pairing = PendingRequest<PlayerAnswer<PairAccepted | Problem>>;

interface PairedController {
	controllerId: string;
	controllerName: string;
	pairedAt: number;
	token: string;
}

describe('POST /pair', () => {
	let cli: Cli;
	let client: PlayerClient;
	let code: string;
	let daemon: Daemon;
	let dataDir: string;
	let dir: string;

	function controllers(): Array<PairedController> {
		return JSON.parse(secret('controllers')) as Array<PairedController>;
	}

	function request(overrides: Partial<PairRequest> = {}): PairRequest {
		return { code, controllerId: 'phone-1', controllerName: 'pixel 8', ...overrides };
	}

	function secret(name: string): string {
		return readFileSync(join(dataDir, 'secrets', name), 'utf8');
	}

	async function tokenFrom(pairing: Pairing): Promise<string> {
		const { json } = await pairing;
		if (!('token' in json)) {
			throw new Error(`expected a token, got ${JSON.stringify(json)}`);
		}

		return json.token;
	}

	// one digit off the provisioned code, so it cannot collide with it the way a literal might
	function wrongCode(): string {
		return `${(Number(code[0]) + 1) % 10}${code.slice(1)}`;
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
		code = pairingCode(cli.pair().stdout);
		daemon = await cli.run();
		client = new PlayerClient(`http://127.0.0.1:${PORT}`, new FetchTransport());
	});

	afterEach(async () => {
		await daemon.stop();
		rmSync(dir, { force: true, recursive: true });
	});

	it('trades the provisioned code for a token', async () => {
		const answer = await client.pair(request());

		expect(answer.status).toBe(200);
		expect(answer.headers['content-type']).toBe('application/json');
		expect(answer.json).toEqual({ token: expect.stringMatching(/^[0-9a-f]{64}$/) });
	});

	it('stores the controller against the token it returned', async () => {
		const token = await tokenFrom(client.pair(request()));

		expect(controllers()).toEqual([
			{
				controllerId: 'phone-1',
				controllerName: 'pixel 8',
				pairedAt: expect.any(Number),
				token,
			},
		]);
	});

	it('writes the media server credential when the body carries one', async () => {
		await client.pair(request({ mediaServer: MEDIA_SERVER }));

		expect(JSON.parse(secret('mediaServer'))).toEqual(MEDIA_SERVER);
	});

	it('writes no media server credential when the body carries none', async () => {
		await client.pair(request());

		expect(existsSync(join(dataDir, 'secrets', 'mediaServer'))).toBe(false);
	});

	it('replaces the record when the same controller pairs again', async () => {
		const first = await tokenFrom(client.pair(request()));
		const second = await tokenFrom(client.pair(request()));

		expect(second).not.toBe(first);
		expect(controllers()).toEqual([expect.objectContaining({ token: second })]);
	});

	it('keeps a second controller alongside the first', async () => {
		await client.pair(request());
		await client.pair(request({ controllerId: 'phone-2', controllerName: 'pixel 9' }));

		expect(controllers().map((held) => held.controllerId)).toEqual(['phone-1', 'phone-2']);
	});

	it('refuses a wrong code without recording a controller', async () => {
		const answer = await client.pair(request({ code: wrongCode() }));

		expect(answer.status).toBe(401);
		expect(answer.headers['content-type']).toBe('application/problem+json');
		expect(answer.json).toMatchObject({ code: 'invalid_pairing_code', status: 401 });
		expect(existsSync(join(dataDir, 'secrets', 'controllers'))).toBe(false);
	});

	// The curve only advances when an attempt actually reaches the credential, so a throttled
	// caller cannot extend its own block by hammering — nor can a legitimate client retrying.
	it('throttles after three refusals and holds the block without extending it', async () => {
		const wrong = request({ code: wrongCode() });

		for (const _ of [1, 2, 3]) {
			expect((await client.pair(wrong)).status).toBe(401);
		}

		const blocked = await client.pair(wrong);
		expect(blocked.status).toBe(429);
		expect(blocked.headers['retry-after']).toBe('1');
		expect(blocked.json).toMatchObject({ code: 'too_many_attempts', status: 429 });

		expect((await client.pair(wrong)).headers['retry-after']).toBe('1');

		await new Promise((resolve) => setTimeout(resolve, 1_100));

		expect((await client.pair(wrong)).status).toBe(401);

		const doubled = await client.pair(wrong);
		expect(doubled.status).toBe(429);
		expect(doubled.headers['retry-after']).toBe('2');
	});

	// the gate is in front of the code comparison, so the block is not something a controller can
	// spend a correct code to leave early
	it('refuses even the provisioned code while the caller is blocked', async () => {
		const wrong = request({ code: wrongCode() });

		for (const _ of [1, 2, 3]) {
			await client.pair(wrong);
		}

		const answer = await client.pair(request());

		expect(answer.status).toBe(429);
		expect(answer.json).toMatchObject({ code: 'too_many_attempts' });
	});

	// two failures stay under the free allowance, so the pair below is reached rather than blocked.
	// Uncleared, the second wrong code after it would be the third failure and answer 429.
	it('clears the failures behind a successful pair', async () => {
		const wrong = request({ code: wrongCode() });

		for (const _ of [1, 2]) {
			await client.pair(wrong);
		}

		expect((await client.pair(request())).status).toBe(200);

		for (const _ of [1, 2, 3]) {
			expect((await client.pair(wrong)).status).toBe(401);
		}
	});
});
