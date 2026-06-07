import type { PlaybackStore } from '../stores/Playback';

export interface UpcomingQueueEntry {
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

// Bounds how far ahead sources (and their signed streaming URLs) are pre-resolved for the
// native lookahead buffer.
export const UPCOMING_QUEUE_WINDOW = 10;

type UpcomingQueueStore = Pick<PlaybackStore, 'loopMode' | 'trackIndex' | 'tracks'>;

// Builds the ordered buffer of tracks after the current one that the native audio engine
// uses to keep auto-advancing while the JS runtime is frozen in the background. Stops at the
// first track without a resolvable source — the engine cannot gaplessly skip past a gap.
export function buildUpcomingQueueEntries(
	store: UpcomingQueueStore,
	resolveSource: (trackId: string) => string | null,
): Array<UpcomingQueueEntry> {
	const { loopMode, trackIndex, tracks } = store;
	if (tracks.length === 0) {
		return [];
	}

	const entries: Array<UpcomingQueueEntry> = [];
	for (let offset = 1; offset <= UPCOMING_QUEUE_WINDOW; offset++) {
		let index: number;
		if (loopMode === 'track') {
			index = trackIndex;
		} else if (loopMode === 'queue') {
			index = (trackIndex + offset) % tracks.length;
		} else {
			index = trackIndex + offset;
			if (index >= tracks.length) {
				break;
			}
		}

		const track = tracks[index];
		if (!track) {
			break;
		}

		const sourceUrl = resolveSource(track.id);
		if (!sourceUrl) {
			break;
		}

		const durationSeconds = Number.isFinite(track.duration) ? track.duration : 0;
		entries.push({
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
		});
	}

	return entries;
}

export function serializeUpcomingQueue(entries: Array<UpcomingQueueEntry>): string {
	return JSON.stringify(entries);
}
