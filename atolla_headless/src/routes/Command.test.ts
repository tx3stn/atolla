import { describe, expect, it } from 'bun:test';
import type { Album } from 'atolla_core/src/models/Album';
import type { Track } from 'atolla_core/src/models/Track';
import { LoopModes, PlaybackStore } from 'atolla_player/src/stores/Playback';
import { makeStateVersion } from '../StateVersion';
import { type CommandDeps, handleCommand } from './Command';

const ALBUM: Album = {
	artistId: 'a1',
	artistName: 'Aphex Twin',
	id: 'al1',
	name: 'Selected Ambient Works',
};

function track(id: string, name = `track ${id}`): Track {
	return { duration: 180, id, name };
}

const TRACKS = [track('t1'), track('t2'), track('t3')];

function fixture(): CommandDeps {
	const playback = new PlaybackStore();
	const version = makeStateVersion();

	playback.subscribe(() => version.bump());

	return { playback, restored: Promise.resolve(), version };
}

async function send(deps: CommandDeps, command: Record<string, unknown>) {
	const answer = await handleCommand(deps, JSON.stringify(command));

	return { body: answer.body === '' ? undefined : JSON.parse(answer.body), status: answer.status };
}

async function queued(deps: CommandDeps): Promise<void> {
	await send(deps, { album: ALBUM, command: 'setQueue', trackIndex: 0, tracks: TRACKS });
}

describe('handleCommand', () => {
	it('accepts a command and answers with the version reflecting it', async () => {
		const deps = fixture();

		const answer = await send(deps, { command: 'play' });

		expect(answer.status).toBe(202);
		expect(answer.body).toEqual({ version: deps.version.current });
	});

	it('advances the version when the command changed something', async () => {
		const deps = fixture();
		const before = deps.version.current;

		await send(deps, { command: 'play' });

		expect(deps.version.current).toBeGreaterThan(before);
	});

	it('leaves the version alone when the command changed nothing', async () => {
		const deps = fixture();
		await send(deps, { command: 'pause' });
		const settled = deps.version.current;

		await send(deps, { command: 'pause' });

		expect(deps.version.current).toBe(settled);
	});

	it('starts and stops playback', async () => {
		const deps = fixture();

		await send(deps, { command: 'play' });
		expect(deps.playback.isPlaying).toBe(true);

		await send(deps, { command: 'pause' });
		expect(deps.playback.isPlaying).toBe(false);
	});

	it('replaces the queue, with the album it came from', async () => {
		const deps = fixture();

		await send(deps, { album: ALBUM, command: 'setQueue', trackIndex: 1, tracks: TRACKS });

		expect(deps.playback.tracks.map((t) => t.id)).toEqual(['t1', 't2', 't3']);
		expect(deps.playback.trackIndex).toBe(1);
		expect(deps.playback.album).toEqual(ALBUM);
	});

	it('replaces the queue with no album when none was sent', async () => {
		const deps = fixture();

		await send(deps, { command: 'setQueue', tracks: TRACKS });

		expect(deps.playback.tracks).toHaveLength(3);
		expect(deps.playback.album).toBeNull();
	});

	it('appends to the queue and inserts after the current track', async () => {
		const deps = fixture();
		await queued(deps);

		await send(deps, { command: 'addToQueue', tracks: [track('t9')] });
		expect(deps.playback.tracks[deps.playback.tracks.length - 1]?.id).toBe('t9');

		await send(deps, { command: 'playNext', tracks: [track('t4')] });
		expect(deps.playback.tracks[1]?.id).toBe('t4');
	});

	it('moves between tracks', async () => {
		const deps = fixture();
		await queued(deps);

		await send(deps, { command: 'next' });
		expect(deps.playback.trackIndex).toBe(1);

		await send(deps, { command: 'previous' });
		expect(deps.playback.trackIndex).toBe(0);
	});

	it('jumps to a position in the queue', async () => {
		const deps = fixture();
		await queued(deps);

		await send(deps, { command: 'jumpToIndex', trackIndex: 2 });

		expect(deps.playback.trackIndex).toBe(2);
	});

	it('removes and reorders queue entries', async () => {
		const deps = fixture();
		await queued(deps);

		await send(deps, { command: 'removeAt', trackIndex: 1 });
		expect(deps.playback.tracks.map((t) => t.id)).toEqual(['t1', 't3']);

		await send(deps, { command: 'move', fromIndex: 0, toIndex: 1 });
		expect(deps.playback.tracks.map((t) => t.id)).toEqual(['t3', 't1']);
	});

	it('seeks to a position given in milliseconds', async () => {
		const deps = fixture();
		await queued(deps);

		await send(deps, { command: 'seek', positionMs: 91234 });

		expect(deps.playback.progressSeconds).toBeCloseTo(91.234, 3);
	});

	it('sets the loop mode it was given rather than cycling', async () => {
		const deps = fixture();

		await send(deps, { command: 'setLoopMode', loopMode: 'track' });

		expect(deps.playback.loopMode).toBe(LoopModes.track);
	});

	it('applies a queue command whose guard still matches', async () => {
		const deps = fixture();
		await queued(deps);

		await send(deps, { command: 'removeAt', trackId: 't2', trackIndex: 1 });

		expect(deps.playback.tracks.map((t) => t.id)).toEqual(['t1', 't3']);
	});

	it('drops a queue command whose track has moved under it', async () => {
		const deps = fixture();
		await queued(deps);
		const settled = deps.version.current;

		const answer = await send(deps, { command: 'removeAt', trackId: 't2', trackIndex: 0 });

		expect(deps.playback.tracks.map((t) => t.id)).toEqual(['t1', 't2', 't3']);
		expect(answer.status).toBe(202);
		expect(deps.version.current).toBe(settled);
	});

	it('refuses a track array the server could not check', async () => {
		const deps = fixture();

		const answer = await send(deps, { command: 'setQueue', tracks: [{ id: 't1' }] });

		expect(answer.status).toBe(400);
		expect(deps.playback.tracks).toEqual([]);
	});

	it('refuses a setQueue carrying no tracks at all', async () => {
		const deps = fixture();

		expect((await send(deps, { command: 'setQueue' })).status).toBe(400);
	});

	it('waits for the restore before acting, so it cannot be overwritten by it', async () => {
		const playback = new PlaybackStore();
		const version = makeStateVersion();
		let release = (): void => {};
		const restored = new Promise<void>((resolve) => {
			release = resolve;
		});

		playback.subscribe(() => version.bump());

		const answered = handleCommand({ playback, restored, version }, '{"command":"play"}');
		await Promise.resolve();
		expect(playback.isPlaying).toBe(false);

		release();
		await answered;

		expect(playback.isPlaying).toBe(true);
	});
});
