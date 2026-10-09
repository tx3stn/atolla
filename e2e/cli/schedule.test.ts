import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
	ClockReading,
	PairAccepted,
	StateSnapshot,
	Track,
} from 'atolla_sync/src/api/generated';
import { PlayerClient } from 'atolla_sync/src/api/PlayerClient';
import { Cli, type Daemon, pairingCode } from './cli';
import { silence } from './silence';
import { FetchTransport } from './transport';

const KITCHEN = { clockPort: 45983, name: 'Kitchen', port: 45981 };
const LOUNGE = { clockPort: 45984, name: 'Lounge', port: 45982 };

const TRACKS: Array<Track> = [
	{ duration: 3, id: 'first', name: 'first' },
	{ duration: 3, id: 'second', name: 'second' },
];

const MARGIN_NS = 2_000_000_000;

const IN_STEP_MS = 250;

interface Speaker {
	client: PlayerClient;
	daemon: Daemon;
	token: string;
}

describe('scheduled starts', () => {
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

	function trackStartedAtMs(state: StateSnapshot): number {
		return state.playback.positionAtMs - state.playback.positionMs;
	}

	async function startBothASecondApart(): Promise<void> {
		const reading = (await kitchen.client.clock(kitchen.token)).json as ClockReading;
		const startAtNs = reading.nowNs + MARGIN_NS;

		await kitchen.client.command(kitchen.token, { command: 'setQueue', startAtNs, tracks: TRACKS });
		await new Promise((resolve) => setTimeout(resolve, 1_000));
		await lounge.client.command(lounge.token, { command: 'setQueue', startAtNs, tracks: TRACKS });
	}

	beforeEach(async () => {
		dir = mkdtempSync(join(tmpdir(), 'atolla-cli-schedule-'));
		kitchen = await start(KITCHEN);
		lounge = await start(LOUNGE);

		await lounge.client.command(lounge.token, {
			command: 'followClock',
			host: '127.0.0.1',
			port: KITCHEN.clockPort,
		});
		await until(lounge, (state) => state.members[0].clock.synced, 'the clock to sync');
	});

	afterEach(async () => {
		await kitchen.daemon.stop();
		await lounge.daemon.stop();
		rmSync(dir, { force: true, recursive: true });
	});

	it('holds a speaker at the start of the track until the time it was given', async () => {
		await startBothASecondApart();

		const held = await snapshot(kitchen);

		expect(held.playback.isPlaying).toBe(true);
		expect(held.playback.positionMs).toBe(0);
	});

	it('starts two speakers together on the time they were both given', async () => {
		await startBothASecondApart();
		await until(kitchen, (state) => state.playback.positionMs > 500, 'the kitchen to play');
		await until(lounge, (state) => state.playback.positionMs > 500, 'the lounge to play');

		const [inKitchen, inLounge] = await Promise.all([snapshot(kitchen), snapshot(lounge)]);

		expect(inKitchen.queue.trackIndex).toBe(0);
		expect(inLounge.queue.trackIndex).toBe(0);
		expect(Math.abs(trackStartedAtMs(inKitchen) - trackStartedAtMs(inLounge))).toBeLessThan(
			IN_STEP_MS,
		);
	});

	it('keeps two speakers together into the next track', async () => {
		await startBothASecondApart();

		const onNext = (state: StateSnapshot) =>
			state.queue.trackIndex === 1 && state.playback.positionMs > 300;

		await until(kitchen, onNext, 'the kitchen to reach the next track');
		await until(lounge, onNext, 'the lounge to reach the next track');

		const [inKitchen, inLounge] = await Promise.all([snapshot(kitchen), snapshot(lounge)]);

		expect(inKitchen.queue.trackIndex).toBe(1);
		expect(inLounge.queue.trackIndex).toBe(1);
		expect(Math.abs(trackStartedAtMs(inKitchen) - trackStartedAtMs(inLounge))).toBeLessThan(
			IN_STEP_MS,
		);
	});
});
