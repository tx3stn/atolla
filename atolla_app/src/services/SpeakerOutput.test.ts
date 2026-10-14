import { describe, expect, it } from 'bun:test';
import type { Album } from 'atolla_core/src/models/Album';
import type { Track } from 'atolla_core/src/models/Track';
import { InMemoryKeyValueStore } from 'atolla_core/src/stores/KeyValueStore';
import { LoopModes, PlaybackStore, PlayheadMoves } from 'atolla_player/src/stores/Playback';
import type { Command, CommandAccepted, Hello, Problem } from 'atolla_sync/src/api/generated';
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

const BEDROOM = {
	baseUrl: 'http://192.168.1.44:45889',
	enabled: false,
	icon: null,
	id: 'den',
	name: 'Den',
	token: 'd'.repeat(64),
};

const AUDIO_PORT = 45891;

interface Sent {
	baseUrl: string;
	body: Command;
	token: string;
}

interface Options {
	refusing?: boolean;
	silent?: boolean;
	speakers?: Array<typeof KITCHEN>;
	streamsAudio?: boolean;
	userId?: string;
}

function answer(refusing: boolean): PendingRequest<PlayerAnswer<CommandAccepted | Problem>> {
	const settled = refusing
		? Promise.reject(new Error('unreachable'))
		: Promise.resolve({ headers: {}, json: {} as CommandAccepted, status: 202 });
	return Object.assign(settled, { cancel: () => {} });
}

function greeting(options: Options): PendingRequest<PlayerAnswer<Hello | Problem>> {
	if (options.silent === true) {
		return Object.assign(Promise.reject(new Error('unreachable')), { cancel: () => {} });
	}

	const streamsAudio = options.streamsAudio ?? true;
	const hello: Hello = {
		apiVersions: [1],
		...(streamsAudio ? { audioPort: AUDIO_PORT } : {}),
		id: 'c2be50c9b97e1c53',
		name: 'Speaker',
		tier: 'tight',
		v: 1,
		version: '0.0.0',
	};
	return Object.assign(Promise.resolve({ headers: {}, json: hello, status: 200 }), {
		cancel: () => {},
	});
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
			hello: () => greeting(options),
		}),
		playbackStore,
		playersStore,
		userId: () => options.userId ?? 'user-1',
	});
	output.start();
	await settle();

	const commands = (): Array<Command> => sent.map((entry) => entry.body);
	const commandsTo = (speaker: typeof KITCHEN): Array<Command> =>
		sent.filter((entry) => entry.baseUrl === speaker.baseUrl).map((entry) => entry.body);
	const clear = (): void => {
		sent.length = 0;
	};

	return { clear, commands, commandsTo, output, playbackStore, playersStore, sent };
}

async function grouped(speakers: Array<typeof KITCHEN>) {
	const setup = await harness({ speakers });
	setup.playbackStore.play([track1, track2, track3], album, 0);
	for (const speaker of speakers) {
		setup.playersStore.setEnabled(speaker.id, true);
	}
	await settle();
	setup.clear();
	return setup;
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

	describe('a group of speakers', () => {
		it('drives the first speaker in the tab and has the others join it', async () => {
			const { commandsTo, playbackStore, playersStore } = await harness({
				speakers: [KITCHEN, LOUNGE],
			});
			playbackStore.play([track1, track2], album, 0);

			playersStore.setEnabled(KITCHEN.id, true);
			playersStore.setEnabled(LOUNGE.id, true);
			await settle();

			expect(commandsTo(KITCHEN)).toEqual([
				{ album, command: 'setQueue', trackIndex: 0, tracks: [track1, track2], userId: 'user-1' },
				{ command: 'setLoopMode', loopMode: LoopModes.none },
			]);
			expect(commandsTo(LOUNGE)).toEqual([
				{ command: 'joinSource', host: '192.168.1.42', port: AUDIO_PORT },
			]);
		});

		it('sends playback changes to the source alone', async () => {
			const { commandsTo, playbackStore } = await grouped([KITCHEN, LOUNGE]);

			playbackStore.playPause();
			playbackStore.seekTo(95.5);
			await settle();

			expect(commandsTo(KITCHEN)).toEqual([
				{ command: 'pause' },
				{ command: 'seek', positionMs: 95500 },
			]);
			expect(commandsTo(LOUNGE)).toEqual([]);
		});

		it('lets a member leave its source when it is switched off', async () => {
			const { commandsTo, playersStore } = await grouped([KITCHEN, LOUNGE]);

			playersStore.setEnabled(LOUNGE.id, false);
			await settle();

			expect(commandsTo(LOUNGE)).toEqual([{ command: 'joinSource' }]);
			expect(commandsTo(KITCHEN)).toEqual([]);
		});

		it('hands the group to the next speaker when the source is switched off', async () => {
			const { commandsTo, playersStore } = await grouped([KITCHEN, LOUNGE, BEDROOM]);

			playersStore.setEnabled(KITCHEN.id, false);
			await settle();

			expect(commandsTo(KITCHEN)).toEqual([{ command: 'pause' }]);
			expect(commandsTo(LOUNGE)).toEqual([
				{ command: 'joinSource' },
				{
					album,
					command: 'setQueue',
					trackIndex: 0,
					tracks: [track1, track2],
					userId: 'user-1',
				},
				{ command: 'setLoopMode', loopMode: LoopModes.none },
			]);
			expect(commandsTo(BEDROOM)).toEqual([
				{ command: 'joinSource', host: '192.168.1.43', port: AUDIO_PORT },
			]);
		});

		it('swaps the source when another speaker is moved to the top of the tab', async () => {
			const { commandsTo, playersStore } = await grouped([KITCHEN, LOUNGE]);

			playersStore.reorder(2, 1);
			await settle();

			expect(commandsTo(KITCHEN)).toEqual([
				{ command: 'pause' },
				{ command: 'joinSource', host: '192.168.1.43', port: AUDIO_PORT },
			]);
			expect(commandsTo(LOUNGE)).toEqual([
				{ command: 'joinSource' },
				{
					album,
					command: 'setQueue',
					trackIndex: 0,
					tracks: [track1, track2],
					userId: 'user-1',
				},
				{ command: 'setLoopMode', loopMode: LoopModes.none },
			]);
		});

		it('leaves the others unjoined when the source streams no audio', async () => {
			const { commandsTo, playbackStore, playersStore } = await harness({
				speakers: [KITCHEN, LOUNGE],
				streamsAudio: false,
			});
			playbackStore.play([track1, track2], album, 0);

			playersStore.setEnabled(KITCHEN.id, true);
			playersStore.setEnabled(LOUNGE.id, true);
			await settle();

			expect(commandsTo(LOUNGE)).toEqual([]);
		});

		it('leaves the others unjoined when the source does not answer its greeting', async () => {
			const { commandsTo, playbackStore, playersStore } = await harness({
				silent: true,
				speakers: [KITCHEN, LOUNGE],
			});
			playbackStore.play([track1, track2], album, 0);

			playersStore.setEnabled(KITCHEN.id, true);
			playersStore.setEnabled(LOUNGE.id, true);
			await settle();

			expect(commandsTo(LOUNGE)).toEqual([]);
		});
	});
});
