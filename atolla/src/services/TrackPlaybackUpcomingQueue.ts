import type { Track } from '../models/Track';
import type { PlaybackStore } from '../stores/Playback';

export interface QueueWindowEntry {
	albumName: string;
	artistName: string;
	artworkUrl: string;
	durationMs: number;
	durationSeconds: number;
	hasNext: boolean;
	hasPrevious: boolean;
	sourceUrl: string;
	trackId: string;
	trackName: string;
}

export interface QueueWindowPayload {
	currentIndex: number;
	entries: Array<QueueWindowEntry>;
}

// Bounds how far in each direction sources (and their streaming URLs) are pre-resolved for
// the native window buffer. Forward depth is the screen-off runway: the engine can only
// auto-advance through tracks it already knows about while the JS runtime is frozen.
export const QUEUE_WINDOW_FORWARD = 25;
export const QUEUE_WINDOW_HISTORY = 10;

type QueueWindowStore = Pick<PlaybackStore, 'loopMode' | 'trackIndex' | 'tracks'>;

// Builds the ordered window of the play queue around the current track ([history...,
// current, upcoming...]) that the native audio engine uses to keep auto-advancing forwards
// (gapless) and stepping backwards (previous button) while the JS runtime is frozen in the
// background. Each direction stops at the first track without a resolvable source — the
// engine cannot play past a gap. The current entry is always included (it anchors
// currentIndex), even when its source cannot be resolved.
export function buildPlaybackQueueWindow(
	store: QueueWindowStore,
	resolveSource: (trackId: string) => string | null,
): QueueWindowPayload {
	const { loopMode, trackIndex, tracks } = store;
	const currentTrack = tracks[trackIndex];
	if (tracks.length === 0 || !currentTrack) {
		return { currentIndex: 0, entries: [] };
	}

	const resolveOffsetIndex = (offset: number): number | null => {
		if (loopMode === 'track') {
			return trackIndex;
		}
		if (loopMode === 'queue') {
			return (((trackIndex + offset) % tracks.length) + tracks.length) % tracks.length;
		}
		const index = trackIndex + offset;
		return index >= 0 && index < tracks.length ? index : null;
	};

	const entryAt = (index: number, sourceUrl: string): QueueWindowEntry => {
		const track = tracks[index] as Track;
		const durationSeconds = Number.isFinite(track.duration) ? track.duration : 0;
		return {
			albumName: track.albumName ?? '',
			artistName: track.artistName ?? '',
			artworkUrl: track.albumImageUrl ?? '',
			durationMs: Math.max(0, Math.floor(durationSeconds * 1000)),
			durationSeconds,
			hasNext: index < tracks.length - 1,
			hasPrevious: index > 0,
			sourceUrl,
			trackId: track.id,
			trackName: track.name,
		};
	};

	const history: Array<QueueWindowEntry> = [];
	for (let offset = -1; offset >= -QUEUE_WINDOW_HISTORY; offset--) {
		const index = resolveOffsetIndex(offset);
		if (index == null || !tracks[index]) {
			break;
		}
		const sourceUrl = resolveSource(tracks[index].id);
		if (!sourceUrl) {
			break;
		}
		history.unshift(entryAt(index, sourceUrl));
	}

	const entries: Array<QueueWindowEntry> = [
		...history,
		entryAt(trackIndex, resolveSource(currentTrack.id) ?? ''),
	];

	for (let offset = 1; offset <= QUEUE_WINDOW_FORWARD; offset++) {
		const index = resolveOffsetIndex(offset);
		if (index == null || !tracks[index]) {
			break;
		}
		const sourceUrl = resolveSource(tracks[index].id);
		if (!sourceUrl) {
			break;
		}
		entries.push(entryAt(index, sourceUrl));
	}

	return { currentIndex: history.length, entries };
}

export function serializeQueueWindow(payload: QueueWindowPayload): string {
	return JSON.stringify(payload);
}
