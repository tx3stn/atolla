import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { PairAccepted, StateSnapshot, Track } from 'atolla_sync/src/api/generated';
import { PlayerClient } from 'atolla_sync/src/api/PlayerClient';
import { Cli, type Daemon, pairingCode } from './cli';
import { FetchTransport } from './transport';

// away from the 45889 default and from the sibling suites, so neither a daemon left running on
// this machine nor another spec can make these pass
const PORT = 45993;

const RATE = 8000;

// `none` decodes and keeps time without an output device, which is what docker and the runners
// have. Playback still takes its real duration, so the fixtures are short.
const SILENT = 'none';

const TRACKS: Array<Track> = [
	{ duration: 1, id: 'tone1', name: 'tone one' },
	{ duration: 1, id: 'tone2', name: 'tone two' },
];

// Longer than any window a test watches, so a track ending cannot be mistaken for the state moving
// on its own.
const UNHURRIED: Track = { duration: 30, id: 'unhurried', name: 'unhurried' };

function silence(seconds: number): Buffer {
	const samples = RATE * seconds;
	const data = samples * 2;
	const buffer = Buffer.alloc(44 + data);

	buffer.write('RIFF', 0, 'ascii');
	buffer.writeUInt32LE(36 + data, 4);
	buffer.write('WAVEfmt ', 8, 'ascii');
	buffer.writeUInt32LE(16, 16);
	buffer.writeUInt16LE(1, 20);
	buffer.writeUInt16LE(1, 22);
	buffer.writeUInt32LE(RATE, 24);
	buffer.writeUInt32LE(RATE * 2, 28);
	buffer.writeUInt16LE(2, 32);
	buffer.writeUInt16LE(16, 34);
	buffer.write('data', 36, 'ascii');
	buffer.writeUInt32LE(data, 40);

	return buffer;
}

describe('playback', () => {
	let cli: Cli;
	let client: PlayerClient;
	let daemon: Daemon;
	let dir: string;
	let token: string;

	async function snapshot(): Promise<StateSnapshot> {
		const answer = await client.state(token);
		if (answer.status !== 200 || answer.json === undefined || !('playback' in answer.json)) {
			throw new Error(`expected a snapshot, got ${answer.status} ${JSON.stringify(answer.json)}`);
		}

		return answer.json;
	}

	async function until(
		reached: (state: StateSnapshot) => boolean,
		what: string,
	): Promise<StateSnapshot> {
		for (let attempt = 0; attempt < 100; attempt++) {
			const state = await snapshot();
			if (reached(state)) {
				return state;
			}

			await new Promise((resolve) => setTimeout(resolve, 100));
		}

		throw new Error(`gave up waiting for ${what}`);
	}

	beforeEach(async () => {
		dir = mkdtempSync(join(tmpdir(), 'atolla-cli-'));
		const dataDir = join(dir, 'data');
		const configPath = join(dir, 'etc', 'player.json');

		mkdirSync(dirname(configPath), { recursive: true });
		mkdirSync(join(dataDir, 'media'), { recursive: true });

		for (const track of TRACKS) {
			writeFileSync(join(dataDir, 'media', track.id), silence(track.duration));
		}

		writeFileSync(join(dataDir, 'media', UNHURRIED.id), silence(UNHURRIED.duration));

		writeFileSync(
			configPath,
			JSON.stringify({
				audioDevice: SILENT,
				bindAddress: '127.0.0.1',
				dataDir,
				language: 'en',
				name: 'Kitchen',
				port: PORT,
			}),
		);

		cli = new Cli({ config: configPath });
		const code = pairingCode(cli.pair().stdout);
		daemon = await cli.run();
		client = new PlayerClient(`http://127.0.0.1:${PORT}`, new FetchTransport());

		const paired = await client.pair({ code, controllerId: 'phone-1', controllerName: 'pixel 8' });
		token = (paired.json as PairAccepted).token;
	});

	afterEach(async () => {
		await daemon.stop();
		rmSync(dir, { force: true, recursive: true });
	});

	it('plays the queue it is given and reports the position moving', async () => {
		await client.command(token, { command: 'setQueue', trackIndex: 0, tracks: TRACKS });
		await client.command(token, { command: 'play' });

		const playing = await until((state) => state.playback.positionMs > 0, 'the position to move');

		expect(playing.playback.isPlaying).toBe(true);
		expect(playing.queue.trackIndex).toBe(0);
	});

	it('moves to the next track when one finishes', async () => {
		await client.command(token, { command: 'setQueue', trackIndex: 0, tracks: TRACKS });
		await client.command(token, { command: 'play' });

		const advanced = await until((state) => state.queue.trackIndex === 1, 'the track to finish');

		expect(advanced.members[0].state).toBe('playing');
	});

	it('pauses where it was asked to', async () => {
		await client.command(token, { command: 'setQueue', trackIndex: 0, tracks: TRACKS });
		await client.command(token, { command: 'play' });
		await until((state) => state.playback.positionMs > 0, 'the position to move');
		await client.command(token, { command: 'pause' });

		const paused = await until((state) => !state.playback.isPlaying, 'playback to pause');

		expect(paused.playback.positionMs).toBeGreaterThan(0);
	});

	it('leaves a long poll waiting while a track plays', async () => {
		await client.command(token, { command: 'setQueue', trackIndex: 0, tracks: [UNHURRIED] });
		await client.command(token, { command: 'play' });

		const playing = await until((state) => state.playback.positionMs > 0, 'the position to move');

		let answered = false;
		const polling = client.state(token, playing.version);

		polling.then(
			() => {
				answered = true;
			},
			() => {},
		);

		// Progress ticks five times a second, so an unfiltered version bump would answer at once.
		await new Promise((resolve) => setTimeout(resolve, 2_000));

		expect(answered).toBe(false);

		polling.cancel?.();
	});
});
