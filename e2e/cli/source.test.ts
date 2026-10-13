import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Hello, PairAccepted, StateSnapshot, Track } from 'atolla_sync/src/api/generated';
import { PlayerClient } from 'atolla_sync/src/api/PlayerClient';
import { Cli, type Daemon, pairingCode } from './cli';
import { silence } from './silence';
import { FetchTransport } from './transport';

const KITCHEN = { audioPort: 45973, clockPort: 45972, name: 'Kitchen', port: 45971 };
const LOUNGE = { audioPort: 45976, clockPort: 45975, name: 'Lounge', port: 45974 };

const TRACKS: Array<Track> = [{ duration: 3, id: 'first', name: 'first' }];

interface Speaker {
	client: PlayerClient;
	daemon: Daemon;
	token: string;
}

describe('joining a source', () => {
	let dir: string;
	let kitchen: Speaker;
	let lounge: Speaker;

	async function start(speaker: typeof KITCHEN): Promise<Speaker> {
		const root = join(dir, speaker.name);
		const configPath = join(root, 'player.json');
		const dataDir = join(root, 'data');

		mkdirSync(join(dataDir, 'media'), { recursive: true });

		for (const track of TRACKS) {
			writeFileSync(join(dataDir, 'media', track.id), silence(track.duration));
		}

		writeFileSync(
			configPath,
			JSON.stringify({
				audioDevice: 'none',
				audioPort: speaker.audioPort,
				bindAddress: '127.0.0.1',
				clockPort: speaker.clockPort,
				dataDir,
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

	async function snapshot(speaker: Speaker): Promise<StateSnapshot> {
		const answer = await speaker.client.state(speaker.token);

		return answer.json as StateSnapshot;
	}

	async function until(
		speaker: Speaker,
		reached: (state: StateSnapshot) => boolean,
		what: string,
	): Promise<StateSnapshot> {
		for (let attempt = 0; attempt < 100; attempt++) {
			const state = await snapshot(speaker);
			if (reached(state)) {
				return state;
			}

			await new Promise((resolve) => setTimeout(resolve, 100));
		}

		throw new Error(`gave up waiting for ${what}`);
	}

	async function joinKitchen(): Promise<void> {
		const hello = (await kitchen.client.hello()).json as Hello;

		await lounge.client.command(lounge.token, {
			command: 'joinSource',
			host: '127.0.0.1',
			port: hello.audioPort,
		});
	}

	beforeEach(async () => {
		dir = mkdtempSync(join(tmpdir(), 'atolla-cli-source-'));
		kitchen = await start(KITCHEN);
		lounge = await start(LOUNGE);
	});

	afterEach(async () => {
		await kitchen.daemon.stop();
		await lounge.daemon.stop();
		rmSync(dir, { force: true, recursive: true });
	});

	it('receives audio while its source plays, and stops once the source has played its queue', async () => {
		await joinKitchen();

		await kitchen.client.command(kitchen.token, { command: 'setQueue', tracks: TRACKS });

		await until(lounge, (state) => state.members[0].source?.receiving === true, 'audio to arrive');
		await until(kitchen, (state) => !state.playback.isPlaying, 'the kitchen to finish');
		const after = await until(
			lounge,
			(state) => state.members[0].source?.receiving === false,
			'the audio to run out',
		);

		expect(after.members[0].source).toEqual({
			host: '127.0.0.1',
			port: KITCHEN.audioPort,
			receiving: false,
		});
	});

	it('stops playing its own queue when it joins a source', async () => {
		await lounge.client.command(lounge.token, { command: 'setQueue', tracks: TRACKS });
		await until(lounge, (state) => state.playback.isPlaying, 'the lounge to play');

		await joinKitchen();

		const joined = await snapshot(lounge);

		expect(joined.playback.isPlaying).toBe(false);
		expect(joined.members[0].state).toBe('paused');
	});

	it('reports the source it joined, and none once it leaves', async () => {
		await joinKitchen();
		const joined = await snapshot(lounge);

		await lounge.client.command(lounge.token, { command: 'joinSource' });
		const left = await snapshot(lounge);

		expect(joined.members[0].source?.port).toBe(KITCHEN.audioPort);
		expect(left.members[0].source).toBeUndefined();
	});
});
