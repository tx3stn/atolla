import { isAlbum } from 'atolla_core/src/models/Album';
import { isTrack, type Track } from 'atolla_core/src/models/Track';
import { getLogger } from 'atolla_core/src/services/Logger';
import { LoopModes, type PlaybackStore } from 'atolla_player/src/stores/Playback';
import type { Command } from 'atolla_sync/src/api/generated';
import type { Answer } from '../Http';
import type { QueueOwner } from '../QueueOwner';
import type { StateVersion } from '../StateVersion';

export interface CommandDeps {
	playback: PlaybackStore;
	queueOwner: QueueOwner;
	// The server answers before the queue is on disk, so a command arriving during the restore
	// waits for it rather than acting on an empty queue the restore then overwrites.
	restored: Promise<void>;
	version: StateVersion;
}

const MS_PER_SECOND = 1000;

const log = getLogger('command');

export async function handleCommand(deps: CommandDeps, body: string): Promise<Answer> {
	const command = JSON.parse(body) as Command;

	await deps.restored;

	const status = apply(deps, command) ? 202 : 400;
	const tracks =
		'tracks' in command && Array.isArray(command.tracks) ? command.tracks.length : undefined;

	log.debug(command.command, {
		status,
		trackId: deps.playback.track?.id,
		trackIndex: deps.playback.trackIndex,
		tracks,
	});

	if (status === 400) {
		return { body: '', status };
	}

	return { body: JSON.stringify({ version: deps.version.current }), status };
}

// False for a payload the server could not check: the track array is handed across the bridge
// unparsed, so its shape is settled here.
function apply(deps: CommandDeps, command: Command): boolean {
	const { playback } = deps;

	switch (command.command) {
		case 'play':
			playback.setPlaying(true);
			return true;
		case 'pause':
			playback.setPlaying(false);
			return true;
		case 'next':
			playback.next();
			return true;
		case 'previous':
			playback.previousOrRestart();
			return true;
		case 'shuffle':
			playback.shuffle();
			return true;
		case 'seek':
			playback.seekTo(command.positionMs / MS_PER_SECOND);
			return true;
		case 'jumpToIndex':
			if (holds(playback, command.trackIndex, command.trackId)) {
				playback.jumpToIndex(command.trackIndex);
			}
			return true;
		case 'removeAt':
			if (holds(playback, command.trackIndex, command.trackId)) {
				playback.removeFromQueueAt(command.trackIndex);
			}
			return true;
		case 'move':
			if (holds(playback, command.fromIndex, command.trackId)) {
				playback.moveQueueTrack(command.fromIndex, command.toIndex);
			}
			return true;
		case 'setLoopMode':
			playback.setLoopMode(LoopModes[command.loopMode]);
			return true;
		case 'setQueue': {
			// Batched so the queue and its owner are announced together. A subscriber resolves the
			// first track's source the moment the queue notifies, and it picks the credential by
			// owner, so an owner claimed after that notification is claimed too late.
			let applied = false;

			playback.runBatched(() => {
				applied = applyQueue(playback, command.tracks, command.trackIndex ?? 0, command.album);
				if (!applied) {
					return;
				}

				// Replacing a queue resets who owns it: the new owner is whoever is named, or nobody.
				if (command.userId === undefined || playback.tracks.length === 0) {
					deps.queueOwner.clear();
				} else {
					deps.queueOwner.claim(command.userId);
				}
			});

			return applied;
		}
		case 'addToQueue':
			return withTracks(command.tracks, (tracks) => {
				playback.addToQueue(tracks);
				claimIfUnowned(deps, command.userId);
			});
		case 'playNext':
			return withTracks(command.tracks, (tracks) => {
				playback.playNext(tracks);
				claimIfUnowned(deps, command.userId);
			});
	}
}

// Adding to somebody else's queue does not take it over, so a guest can queue a track without the
// rest of the evening being reported against their account.
function claimIfUnowned(deps: CommandDeps, userId: string | undefined): void {
	if (userId !== undefined && deps.queueOwner.get() === null) {
		deps.queueOwner.claim(userId);
	}
}

function applyQueue(
	playback: PlaybackStore,
	given: unknown,
	trackIndex: number,
	album: unknown,
): boolean {
	return withTracks(given, (tracks) => {
		if (isAlbum(album)) {
			playback.play(tracks, album, trackIndex);
			return;
		}

		playback.playTracks(tracks, trackIndex);
	});
}

// A stale mirror names a position that has since moved, so a command carrying the id it expected
// there is dropped rather than applied to whatever took its place.
function holds(playback: PlaybackStore, index: number, trackId: string | undefined): boolean {
	if (trackId === undefined || playback.tracks[index]?.id === trackId) {
		return true;
	}

	log.info('dropped a command whose track had moved', { index, trackId });
	return false;
}

function withTracks(given: unknown, use: (tracks: Array<Track>) => void): boolean {
	if (!Array.isArray(given) || !given.every(isTrack)) {
		return false;
	}

	use(given);
	return true;
}
