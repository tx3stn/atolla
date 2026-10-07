import { describe, expect, it } from 'bun:test';
import type { Album } from 'atolla_core/src/models/Album';
import type { Track } from 'atolla_core/src/models/Track';
import { InMemoryKeyValueStore } from 'atolla_core/src/stores/KeyValueStore';
import { LoopModes, PlaybackStore, PlayheadMoves } from 'atolla_player/src/stores/Playback';
import type { Command, CommandAccepted, Problem } from 'atolla_sync/src/api/generated';
import type { PlayerAnswer } from 'atolla_sync/src/api/PlayerClient';
import type { PendingRequest } from 'atolla_sync/src/api/Transport';
import { PLAYERS_KEY, PlayersStore } from '../stores/Players';
import { SpeakerOutput } from './SpeakerOutput';

const album = {
	artistId: 'artist-1',
	artistName: 'Artist',
	id: 'album-1',
	name: 'Album',
} satisfies Album;
const track1 = { duration: 180, id: 'track-1', name: 'One' } satisfies Track;
const track2 = { duration: 240, id: 'track-2', name: 'Two' } satisfies Track;
const track3 = { duration: 300, id: 'track-3', name: 'Three' } satisfies Track;
const track4 = { duration: 200, id: 'track-4', name: 'Four' } satisfies Track;

const KITCHEN = {
	baseUrl: 'http://192.168.1.42:45889',
	enabled: false,
	icon: null,
	id: 'kitchen',
	name: 'Kitchen',
	token: 'k'.repeat(64),
};

const LOUNGE = {
	baseUrl: 'http://192.168.1.43:45889',
	enabled: false,
	icon: null,
	id: 'lounge',
	name: 'Lounge',
	token: 'l'.repeat(64),
};

interface Sent {
	baseUrl: string;
	body: Command;
	token: string;
}

interface Options {
	refusing?: boolean;
	speakers?: Array<typeof KITCHEN>;
	userId?: string;
}

function answer(refusing: boolean): PendingRequest<PlayerAnswer<CommandAccepted | Problem>> {
	const settled = refusing
		? Promise.reject(new Error('unreachable'))
		: Promise.resolve({ headers: {}, json: {} as CommandAccepted, status: 202 });
	return Object.assign(settled, { cancel: () => {} });
}

async function harness(options: Options = {}) {
	const keyValueStore = new InMemoryKeyValueStore();
	await keyValueStore.storeString(
		PLAYERS_KEY,
		JSON.stringify({
			players: options.speakers ?? [KITCHEN],
			thisDeviceEnabled: false,
			version: 1,
		}),
	);
	const playersStore = new PlayersStore({ store: keyValueStore });
	const playbackStore = new PlaybackStore();
	const sent: Array<Sent> = [];
	const output = new SpeakerOutput({
		createClient: (baseUrl) => ({
			command: (token, body) => {
				sent.push({ baseUrl, body, token });
				return answer(options.refusing === true);
			},
		}),
		playbackStore,
		playersStore,
		userId: () => options.userId ?? 'user-1',
	});
	output.start();
	await settle();

	const commands = (): Array<Command> => sent.map((entry) => entry.body);
	const clear = (): void => {
		sent.length = 0;
	};

	return { clear, commands, output, playbackStore, playersStore, sent };
}

async function playingThroughKitchen(options: Options = {}) {
	const setup = await harness(options);
	setup.playbackStore.play([track1, track2, track3], album, 0);
	setup.playersStore.setEnabled(KITCHEN.id, true);
	await settle();
	setup.clear();
	return setup;
}

function settle(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('SpeakerOutput', () => {
	it('sends a speaker the current and next track when it is switched on', async () => {
		const { commands, playbackStore, playersStore, sent } = await harness();
		playbackStore.play([track1, track2, track3], album, 0);
		playbackStore.updateProgress(30);

		playersStore.setEnabled(KITCHEN.id, true);
		await settle();

		expect(commands()).toEqual([
			{ album, command: 'setQueue', trackIndex: 0, tracks: [track1, track2], userId: 'user-1' },
			{ command: 'setLoopMode', loopMode: LoopModes.none },
			{ command: 'seek', positionMs: 30000 },
		]);
		expect(sent.every((entry) => entry.token === KITCHEN.token)).toBe(true);
		expect(sent.every((entry) => entry.baseUrl === KITCHEN.baseUrl)).toBe(true);
	});

	it('pauses a speaker it switches on while the phone is paused', async () => {
		const { commands, playbackStore, playersStore } = await harness();
		playbackStore.play([track1, track2], album, 0);
		playbackStore.setPlaying(false);

		playersStore.setEnabled(KITCHEN.id, true);
		await settle();

		expect(commands()).toEqual([
			{ album, command: 'setQueue', trackIndex: 0, tracks: [track1, track2], userId: 'user-1' },
			{ command: 'setLoopMode', loopMode: LoopModes.none },
			{ command: 'pause' },
		]);
	});

	it('leaves the queue unowned when nobody is signed in', async () => {
		const { commands, playbackStore, playersStore } = await harness({ userId: '' });
		playbackStore.play([track1], album, 0);

		playersStore.setEnabled(KITCHEN.id, true);
		await settle();

		expect(commands()[0]).toEqual({
			album,
			command: 'setQueue',
			trackIndex: 0,
			tracks: [track1],
		});
	});

	it('pauses a speaker once it is switched off and sends it nothing more', async () => {
		const { commands, playbackStore, playersStore } = await playingThroughKitchen();

		playersStore.setEnabled(KITCHEN.id, false);
		playbackStore.next();
		await settle();

		expect(commands()).toEqual([{ command: 'pause' }]);
	});

	it('mirrors pause and resume', async () => {
		const { commands, playbackStore } = await playingThroughKitchen();

		playbackStore.playPause();
		playbackStore.playPause();
		await settle();

		expect(commands()).toEqual([{ command: 'pause' }, { command: 'play' }]);
	});

	it('mirrors a seek without sending the queue again', async () => {
		const { commands, playbackStore } = await playingThroughKitchen();

		playbackStore.seekTo(95.5);
		await settle();

		expect(commands()).toEqual([{ command: 'seek', positionMs: 95500 }]);
	});

	it('only sends the following track when a track finishes, since the speaker moves on by itself', async () => {
		const { commands, playbackStore } = await playingThroughKitchen();

		playbackStore.reconcileToNativeTrack(track2.id, 0.3, PlayheadMoves.finished);
		await settle();

		expect(commands()).toEqual([{ command: 'addToQueue', tracks: [track3], userId: 'user-1' }]);
	});

	it('sends the queue again when the phone steps past a track that failed', async () => {
		const { commands, playbackStore } = await playingThroughKitchen();

		playbackStore.advancePastTrackId(track1.id, PlayheadMoves.jumped);
		await settle();

		expect(commands()).toEqual([
			{
				album,
				command: 'setQueue',
				trackIndex: 0,
				tracks: [track2, track3],
				userId: 'user-1',
			},
			{ command: 'setLoopMode', loopMode: LoopModes.none },
		]);
	});

	it('sends the queue again when the user skips', async () => {
		const { commands, playbackStore } = await playingThroughKitchen();

		playbackStore.next();
		await settle();

		expect(commands()).toEqual([
			{
				album,
				command: 'setQueue',
				trackIndex: 0,
				tracks: [track2, track3],
				userId: 'user-1',
			},
			{ command: 'setLoopMode', loopMode: LoopModes.none },
		]);
	});

	it('swaps the next track when the queue after the current one changes', async () => {
		const { commands, playbackStore } = await playingThroughKitchen();

		playbackStore.playNext([track4]);
		await settle();

		expect(commands()).toEqual([
			{ command: 'removeAt', trackId: track2.id, trackIndex: 1 },
			{ command: 'addToQueue', tracks: [track4], userId: 'user-1' },
		]);
	});

	it('finds the next track further along the speaker queue after a track finishes', async () => {
		const { clear, commands, playbackStore } = await playingThroughKitchen();
		playbackStore.reconcileToNativeTrack(track2.id, 0.3, PlayheadMoves.finished);
		await settle();
		clear();

		playbackStore.playNext([track4]);
		await settle();

		expect(commands()).toEqual([
			{ command: 'removeAt', trackId: track3.id, trackIndex: 2 },
			{ command: 'addToQueue', tracks: [track4], userId: 'user-1' },
		]);
	});

	it('mirrors the loop mode', async () => {
		const { commands, playbackStore } = await playingThroughKitchen();

		playbackStore.setLoopMode(LoopModes.track);
		await settle();

		expect(commands()).toEqual([{ command: 'setLoopMode', loopMode: LoopModes.track }]);
	});

	it('sends nothing when a repeated track comes round again', async () => {
		const { clear, commands, playbackStore } = await playingThroughKitchen();
		playbackStore.setLoopMode(LoopModes.track);
		await settle();
		clear();

		playbackStore.advancePastTrackId(track1.id, PlayheadMoves.finished);
		await settle();

		expect(commands()).toEqual([]);
	});

	it('sends the first track ahead at the end of a looping queue', async () => {
		const { clear, commands, playbackStore } = await playingThroughKitchen();
		playbackStore.jumpToIndex(2);
		playbackStore.setLoopMode(LoopModes.queue);
		await settle();
		clear();

		playbackStore.reconcileToNativeTrack(track1.id, 0.3, PlayheadMoves.finished);
		await settle();

		expect(commands()).toEqual([{ command: 'addToQueue', tracks: [track2], userId: 'user-1' }]);
	});

	it('drives every enabled speaker', async () => {
		const { playbackStore, playersStore, sent } = await harness({ speakers: [KITCHEN, LOUNGE] });
		playbackStore.play([track1, track2], album, 0);

		playersStore.setEnabled(KITCHEN.id, true);
		playersStore.setEnabled(LOUNGE.id, true);
		await settle();

		const reached = new Set(sent.map((entry) => entry.baseUrl));
		expect(reached).toEqual(new Set([KITCHEN.baseUrl, LOUNGE.baseUrl]));
	});

	it('keeps sending after a command fails', async () => {
		const { commands, playbackStore } = await playingThroughKitchen({ refusing: true });

		playbackStore.playPause();
		playbackStore.playPause();
		await settle();

		expect(commands()).toEqual([{ command: 'pause' }, { command: 'play' }]);
	});

	it('stops listening once disposed', async () => {
		const { commands, output, playbackStore } = await playingThroughKitchen();

		output.dispose();
		playbackStore.playPause();
		await settle();

		expect(commands()).toEqual([]);
	});
});
