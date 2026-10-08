import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { MemberClock, PairAccepted, StateSnapshot } from 'atolla_sync/src/api/generated';
import { PlayerClient } from 'atolla_sync/src/api/PlayerClient';
import { Cli, type Daemon, pairingCode } from './cli';
import { FetchTransport } from './transport';

const KITCHEN = { clockPort: 45997, name: 'Kitchen', port: 45995 };
const LOUNGE = { clockPort: 45998, name: 'Lounge', port: 45996 };

interface Speaker {
	client: PlayerClient;
	daemon: Daemon;
	token: string;
}

describe('clock', () => {
	let dir: string;
	let kitchen: Speaker;
	let lounge: Speaker;

	async function start(speaker: typeof KITCHEN): Promise<Speaker> {
		const configPath = join(dir, speaker.name, 'player.json');

		mkdirSync(dirname(configPath), { recursive: true });
		writeFileSync(
			configPath,
			JSON.stringify({
				audioDevice: 'none',
				bindAddress: '127.0.0.1',
				clockPort: speaker.clockPort,
				dataDir: join(dir, speaker.name, 'data'),
				language: 'en',
				name: speaker.name,
				port: speaker.port,
			}),
		);

		const cli = new Cli({ config: configPath });
		const code = pairingCode(cli.pair().stdout);
		const daemon = await cli.run();
		const client = new PlayerClient(`http://127.0.0.1:${speaker.port}`, new FetchTransport());
		const paired = await client.pair({ code, controllerId: 'phone-1', controllerName: 'pixel 8' });

		return { client, daemon, token: (paired.json as PairAccepted).token };
	}

	async function clockOf(speaker: Speaker): Promise<MemberClock> {
		const answer = await speaker.client.state(speaker.token);
		const snapshot = answer.json as StateSnapshot;

		return snapshot.members[0].clock;
	}

	async function until(
		speaker: Speaker,
		reached: (clock: MemberClock) => boolean,
		what: string,
	): Promise<MemberClock> {
		for (let attempt = 0; attempt < 100; attempt++) {
			const clock = await clockOf(speaker);
			if (reached(clock)) {
				return clock;
			}

			await new Promise((resolve) => setTimeout(resolve, 100));
		}

		throw new Error(`gave up waiting for ${what}`);
	}

	beforeEach(async () => {
		dir = mkdtempSync(join(tmpdir(), 'atolla-cli-clock-'));
		kitchen = await start(KITCHEN);
		lounge = await start(LOUNGE);
	});

	afterEach(async () => {
		await kitchen.daemon.stop();
		await lounge.daemon.stop();
		rmSync(dir, { force: true, recursive: true });
	});

	it('reads the time on the clock a player serves, and the port it serves it on', async () => {
		const answer = await kitchen.client.clock(kitchen.token);

		expect(answer.status).toBe(200);
		expect(answer.json).toEqual({ nowNs: expect.any(Number), port: KITCHEN.clockPort });
	});

	it("follows another player's clock and says when it has synced", async () => {
		const following = { host: '127.0.0.1', port: KITCHEN.clockPort };

		await lounge.client.command(lounge.token, { command: 'followClock', ...following });

		const clock = await until(lounge, (current) => current.synced, 'the clock to sync');

		expect(clock).toEqual({ following, synced: true });
	});

	it('goes back to its own clock when told to follow none', async () => {
		await lounge.client.command(lounge.token, {
			command: 'followClock',
			host: '127.0.0.1',
			port: KITCHEN.clockPort,
		});
		await lounge.client.command(lounge.token, { command: 'followClock' });

		expect(await clockOf(lounge)).toEqual({ synced: true });
	});
});
