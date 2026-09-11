import { describe, expect, it } from 'bun:test';
import type { Album } from 'atolla_core/src/models/Album';
import type { Track } from 'atolla_core/src/models/Track';
import { PlaybackStore } from 'atolla_player/src/stores/Playback';
import type { StateSnapshot } from 'atolla_sync/src/api/generated';
import type { PlayerIdentity } from '../PlayerIdentity';
import { makeStateVersion } from '../StateVersion';
import { handleState, type StateDeps } from './State';

const IDENTITY: PlayerIdentity = {
	id: 'c2be50c9b97e1c53',
	name: 'Kitchen',
	tier: 'tight',
	version: '0.0.0',
};

const NOW = 1758000000000;

const ALBUM: Album = {
	artistId: 'a1',
	artistName: 'Aphex Twin',
	id: 'al1',
	name: 'Selected Ambient Works',
};

const TRACKS: Array<Track> = [
	{ duration: 293.4, id: 't1', name: 'Xtal' },
	{ duration: 568.1, id: 't2', name: 'Tha' },
];

// The domain models and the generated schemas are separate declarations of the same shape, and
// nothing generates one from the other. This fails to compile if the members stop lining up.
const wireShapes: {
	album: Pick<
		NonNullable<StateSnapshot['queue']['album']>,
		'artistId' | 'artistName' | 'id' | 'name'
	>;
	track: Pick<StateSnapshot['queue']['tracks'][number], 'duration' | 'id' | 'name'>;
} = { album: ALBUM, track: TRACKS[0] };

function fixture(): StateDeps {
	const playback = new PlaybackStore();
	const version = makeStateVersion();

	playback.subscribe(() => version.bump());

	return { identity: IDENTITY, now: () => NOW, playback, restored: Promise.resolve(), version };
}

async function read(deps: StateDeps, target = '/state') {
	const answer = await handleState(deps, target);

	return {
		snapshot: answer.body === '' ? undefined : (JSON.parse(answer.body) as StateSnapshot),
		status: answer.status,
	};
}

describe('handleState', () => {
	it('reports who it is and what group it leads', async () => {
		const { snapshot, status } = await read(fixture());

		expect(status).toBe(200);
		expect(snapshot?.group).toBe('default');
		expect(snapshot?.leader).toBe(IDENTITY.id);
	});

	it('reports itself as the only member, since a daemon is a group of one', async () => {
		const { snapshot } = await read(fixture());

		expect(snapshot?.members).toEqual([
			{ enabled: true, id: IDENTITY.id, name: 'Kitchen', state: 'idle', tier: 'tight' },
		]);
	});

	it('is idle with nothing queued, and paused holding a queue it is not playing', async () => {
		const deps = fixture();
		expect((await read(deps)).snapshot?.members[0]?.state).toBe('idle');

		deps.playback.play(TRACKS, ALBUM, 0);
		deps.playback.setPlaying(false);

		expect((await read(deps)).snapshot?.members[0]?.state).toBe('paused');
	});

	it('reports the queue it is holding', async () => {
		const deps = fixture();
		deps.playback.play(TRACKS, ALBUM, 1);

		const { snapshot } = await read(deps);

		expect(snapshot?.queue.tracks.map((t) => t.id)).toEqual(['t1', 't2']);
		expect(snapshot?.queue.trackIndex).toBe(1);
		expect(snapshot?.queue.album as unknown).toEqual(ALBUM);
	});

	it('leaves the album out when the queue came from no album', async () => {
		const deps = fixture();
		deps.playback.playTracks(TRACKS, 0);

		expect((await read(deps)).snapshot?.queue.album).toBeUndefined();
	});

	it('reports the position in milliseconds against the clock it read it at', async () => {
		const deps = fixture();
		deps.playback.play(TRACKS, ALBUM, 0);
		deps.playback.seekTo(91.234);

		const { snapshot } = await read(deps);

		expect(snapshot?.playback.positionMs).toBe(91234);
		expect(snapshot?.playback.positionAtMs).toBe(NOW);
	});

	it('answers the current version when no since was asked for', async () => {
		const deps = fixture();
		deps.playback.play(TRACKS, ALBUM, 0);

		expect((await read(deps)).snapshot?.version).toBe(deps.version.current);
	});

	it('answers at once when something newer than since already exists', async () => {
		const deps = fixture();
		deps.playback.play(TRACKS, ALBUM, 0);

		const { snapshot, status } = await read(deps, '/state?since=1');

		expect(status).toBe(200);
		expect(snapshot?.version).toBe(deps.version.current);
	});

	it('answers at once when since names a version this run will never reach', async () => {
		const deps = fixture();

		const { snapshot, status } = await read(deps, '/state?since=412');

		expect(status).toBe(200);
		expect(snapshot?.version).toBe(1);
	});

	it('holds the request while the caller is up to date, then answers what changed', async () => {
		const deps = fixture();
		let answered: number | undefined;

		const reading = read(deps, '/state?since=1').then(({ status }) => {
			answered = status;
		});
		await Promise.resolve();
		expect(answered).toBeUndefined();

		deps.playback.play(TRACKS, ALBUM, 0);
		await reading;

		expect(answered).toBe(200);
	});

	it('waits for the restore before answering', async () => {
		const deps = fixture();
		let release = (): void => {};
		const restored = new Promise<void>((resolve) => {
			release = resolve;
		});
		let answered = false;

		const reading = read({ ...deps, restored }).then(() => {
			answered = true;
		});
		await Promise.resolve();
		expect(answered).toBe(false);

		release();
		await reading;

		expect(answered).toBe(true);
	});

	it('keeps the wire and domain shapes lined up', () => {
		expect(wireShapes.track.id).toBe('t1');
		expect(wireShapes.album.id).toBe('al1');
	});
});
