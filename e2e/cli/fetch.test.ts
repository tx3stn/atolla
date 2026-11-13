import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { PairAccepted, StateSnapshot, Track } from 'atolla_sync/src/api/generated';
import { PlayerClient } from 'atolla_sync/src/api/PlayerClient';
import { Cli, type Daemon, pairingCode } from './cli';
import { type FakeJellyfin, startJellyfin } from './jellyfin';
import { putCacheWindow } from './media';
import { silence } from './silence';
import { FetchTransport } from './transport';

// away from the 45889 default and from the sibling suites, so neither a daemon left running on
// this machine nor another spec can make these pass
const PORT = 45996;

const BASE_URL = `http://127.0.0.1:${PORT}`;

// `none` decodes and keeps time without an output device, which is what docker and the runners
// have.
const SILENT = 'none';

const USER_ID = 'u1';

// Longer than either test takes, so it is still the current track when the media server goes away.
const PLAYING: Track = { duration: 30, id: 'playing', name: 'playing' };
const NEXT: Track = { duration: 2, id: 'next', name: 'next' };
const LATER: Track = { duration: 2, id: 'later', name: 'later' };

const TRACKS = [PLAYING, NEXT, LATER];

describe('fetching the cache window from the media server', () => {
	let client: PlayerClient;
	let daemon: Daemon;
	let dir: string;
	let jellyfin!: FakeJellyfin;
	let mediaDir: string;
	let token: string;

	function isCached(track: Track): boolean {
		return existsSync(join(mediaDir, track.id));
	}

	async function eventually(
		reached: () => Promise<boolean> | boolean,
		what: string,
	): Promise<void> {
		for (let attempt = 0; attempt < 100; attempt++) {
			if (await reached()) {
				return;
			}

			await new Promise((resolve) => setTimeout(resolve, 100));
		}

		throw new Error(`gave up waiting for ${what}`);
	}

	async function snapshot(): Promise<StateSnapshot> {
		const answer = await client.state(token);

		return answer.json as StateSnapshot;
	}

	beforeEach(async () => {
		jellyfin = startJellyfin(
			[USER_ID],
			new Map(TRACKS.map((track) => [track.id, new Uint8Array(silence(track.duration))])),
		);
		dir = mkdtempSync(join(tmpdir(), 'atolla-cli-'));
		const dataDir = join(dir, 'data');
		const configPath = join(dir, 'etc', 'player.json');
		mediaDir = join(dataDir, 'media');

		mkdirSync(dirname(configPath), { recursive: true });
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

		const cli = new Cli({ config: configPath });
		const code = pairingCode(cli.pair().stdout);
		daemon = await cli.run();
		client = new PlayerClient(BASE_URL, new FetchTransport());

		const paired = await client.pair({
			code,
			controllerId: 'phone-1',
			controllerName: 'pixel 8',
			mediaServer: {
				accessToken: jellyfin.tokenFor(USER_ID),
				baseUrl: jellyfin.baseUrl,
				deviceId: `atolla-4f3c9a1de8b27065-${USER_ID}`,
				serverId: '7e0a5b9c2d4f8613',
				userId: USER_ID,
			},
		});
		token = (paired.json as PairAccepted).token;
	});

	afterEach(async () => {
		await daemon.stop();
		await jellyfin.stop();
		rmSync(dir, { force: true, recursive: true });
	});

	it('downloads the tracks in the window except the one playing, which it streams', async () => {
		await client.command(token, {
			command: 'setQueue',
			trackIndex: 0,
			tracks: TRACKS,
			userId: USER_ID,
		});
		await putCacheWindow(BASE_URL, token, { trackIds: TRACKS.map((track) => track.id) });

		await eventually(() => isCached(NEXT) && isCached(LATER), 'the window to download');

		expect(isCached(PLAYING)).toBe(false);
	});

	it('plays the next track from its downloaded copy once the media server is gone', async () => {
		await client.command(token, {
			command: 'setQueue',
			trackIndex: 0,
			tracks: TRACKS,
			userId: USER_ID,
		});
		await putCacheWindow(BASE_URL, token, { trackIds: TRACKS.map((track) => track.id) });
		await eventually(() => isCached(NEXT), 'the next track to download');

		await jellyfin.stop();
		await client.command(token, { command: 'next' });

		await eventually(async () => {
			const state = await snapshot();
			return state.queue.trackIndex === 1 && state.playback.positionMs > 0;
		}, 'the next track to play from its downloaded copy');
	});
});
