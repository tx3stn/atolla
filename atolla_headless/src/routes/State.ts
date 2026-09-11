import type { PlaybackStore } from 'atolla_player/src/stores/Playback';
import type { PlayerState, StateSnapshot } from 'atolla_sync/src/api/generated';
import type { Answer } from '../Http';
import type { PlayerIdentity } from '../PlayerIdentity';
import type { StateVersion } from '../StateVersion';

export interface StateDeps {
	identity: PlayerIdentity;
	now: () => number;
	playback: PlaybackStore;
	restored: Promise<void>;
	version: StateVersion;
}

// One group, named from the start so that zones are an addition rather than a redesign.
export const GROUP = 'default';

const MS_PER_SECOND = 1000;

const NOT_MODIFIED = 304;

const POLL_MS = 25_000;

export async function handleState(deps: StateDeps, target: string): Promise<Answer> {
	const since = sinceOf(target);

	await deps.restored;

	if (since !== undefined && (await deps.version.waitPast(since, POLL_MS)) === since) {
		return { body: '', status: NOT_MODIFIED };
	}

	return { body: JSON.stringify(snapshot(deps)), status: 200 };
}

// The generated schemas carry an index signature, which the domain interfaces do not, so the two
// are assignable by value but not by declaration. `wireShapes` in the tests is what checks the
// members still line up.
function asWire<T extends object>(value: T): T & { [key: string]: unknown } {
	return value as T & { [key: string]: unknown };
}

function playerState(playback: PlaybackStore): PlayerState {
	if (playback.tracks.length === 0) {
		return 'idle';
	}

	return playback.isPlaying ? 'playing' : 'paused';
}

// The server has already refused a `since` that is not a version, so anything here either parses
// or was never sent.
function sinceOf(target: string): number | undefined {
	const query = target.slice(target.indexOf('?') + 1);

	for (const pair of query.split('&')) {
		const [name, value] = pair.split('=');

		if (name === 'since' && value !== undefined) {
			return Number.parseInt(value, 10);
		}
	}

	return undefined;
}

function snapshot(deps: StateDeps): StateSnapshot {
	const { identity, playback } = deps;

	return {
		group: GROUP,
		leader: identity.id,
		members: [
			{
				enabled: true,
				id: identity.id,
				name: identity.name,
				state: playerState(playback),
				tier: identity.tier,
			},
		],
		playback: {
			isPlaying: playback.isPlaying,
			loopMode: playback.loopMode,
			positionAtMs: deps.now(),
			positionMs: Math.round(playback.progressSeconds * MS_PER_SECOND),
		},
		queue: {
			...(playback.album === null ? {} : { album: asWire(playback.album) }),
			trackIndex: playback.trackIndex,
			tracks: playback.tracks.map(asWire),
		},
		version: deps.version.current,
	};
}
