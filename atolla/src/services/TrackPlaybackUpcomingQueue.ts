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

// how far in each direction sources are pre-resolved for the native window. forward
// depth is the screen-off runway: the engine can only auto-advance through tracks it
// already knows while the JS runtime is frozen
export const QUEUE_WINDOW_FORWARD = 25;
export const QUEUE_WINDOW_HISTORY = 10;

// history slots the sliding cache window keeps behind the current track so back-skips
// stay instant. the rest of the cache (maxTracks - 1 - this) is the forward runway
export const QUEUE_RETAIN_HISTORY = 3;

type QueueWindowStore = Pick<PlaybackStore, 'loopMode' | 'trackIndex' | 'tracks'>;

// resolves a signed offset from the current track to a concrete index, honouring the
// loop mode: track loop pins to the current index, queue loop wraps, none clamps to a
// null (out of range) result the callers stop on
function makeOffsetResolver(store: QueueWindowStore): (offset: number) => number | null {
	const { loopMode, trackIndex, tracks } = store;
	return (offset: number): number | null => {
		if (loopMode === 'track') {
			return trackIndex;
		}
		if (loopMode === 'queue') {
			return (((trackIndex + offset) % tracks.length) + tracks.length) % tracks.length;
		}
		const index = trackIndex + offset;
		return index >= 0 && index < tracks.length ? index : null;
	};
}

// builds the ordered window around the current track ([history, current, upcoming])
// the native engine uses to keep auto-advancing (gapless) and stepping back while JS
// is frozen. each direction stops at the first track with no resolvable source (can't
// play past a gap). the current entry is always included; it anchors currentIndex
export function buildPlaybackQueueWindow(
	store: QueueWindowStore,
	resolveSource: (trackId: string) => string | null,
): QueueWindowPayload {
	const { trackIndex, tracks } = store;
	const currentTrack = tracks[trackIndex];
	if (tracks.length === 0 || !currentTrack) {
		return { currentIndex: 0, entries: [] };
	}

	const resolveOffsetIndex = makeOffsetResolver(store);

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

// builds the set of track ids the streaming cache must not evict: a sliding window of
// up to QUEUE_RETAIN_HISTORY behind, the current track, and the forward runway that fills
// the rest of the cache. sizing guarantees the window never exceeds maxTracks, so pruning
// always converges to <= maxTracks. ids are taken raw (not source-gated) so a track is
// protected before it is cached; retaining an id with no matching file is a native no-op
interface RetainedWindow {
	forwardCount: number;
	ids: Array<string>;
}

function computeRetainedWindow(store: QueueWindowStore, maxTracks: number): RetainedWindow {
	const { trackIndex, tracks } = store;
	const currentTrack = tracks[trackIndex];
	if (tracks.length === 0 || !currentTrack || maxTracks <= 0) {
		return { forwardCount: 0, ids: [] };
	}

	const resolveOffsetIndex = makeOffsetResolver(store);
	const maxHistory = Math.min(QUEUE_RETAIN_HISTORY, Math.max(0, maxTracks - 1));

	const history: Array<string> = [];
	for (let offset = -1; offset >= -maxHistory; offset--) {
		const index = resolveOffsetIndex(offset);
		if (index == null || !tracks[index]) {
			break;
		}
		history.unshift(tracks[index].id);
	}

	const forwardCount = Math.max(0, maxTracks - 1 - history.length);
	const forward: Array<string> = [];
	for (let offset = 1; offset <= forwardCount; offset++) {
		const index = resolveOffsetIndex(offset);
		if (index == null || !tracks[index]) {
			break;
		}
		forward.push(tracks[index].id);
	}

	const seen = new Set<string>();
	const ids = [...history, currentTrack.id, ...forward].filter((id) => {
		if (seen.has(id)) {
			return false;
		}
		seen.add(id);
		return true;
	});

	return { forwardCount, ids };
}

export function buildRetainedTrackIds(store: QueueWindowStore, maxTracks: number): Array<string> {
	return computeRetainedWindow(store, maxTracks).ids;
}

// the forward runway of the retained window, used to bound prefetch depth so the cache
// never fetches a track it would immediately evict (churn). matches the forward slots in
// buildRetainedTrackIds so retention and prefetch stay aligned
export function retainedForwardCount(store: QueueWindowStore, maxTracks: number): number {
	return computeRetainedWindow(store, maxTracks).forwardCount;
}

export function serializeQueueWindow(payload: QueueWindowPayload): string {
	return JSON.stringify(payload);
}
