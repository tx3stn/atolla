import type { Track } from '../models/Track';

type TrackUrlResolver = (track: Track) => string | null;
type TrackCacheChecker = (trackId: string) => boolean;
type TrackCacher = (
	trackId: string,
	url: string,
	onComplete: (source: string | null) => void,
) => void;

interface QueueEntry {
	track: Track;
	trackId: string;
}

export class TrackPlaybackNativePrefetchQueue {
	private queue: Array<QueueEntry> = [];
	private inProgress = false;
	private generation = 0;

	constructor(
		private readonly resolveTrackUrl: TrackUrlResolver,
		private readonly hasCachedTrack: TrackCacheChecker,
		private readonly cacheTrack: TrackCacher,
		private readonly onTrackStored?: (trackId: string) => void,
		private readonly onTrackFetchFailed?: (trackId: string, reason?: string) => void,
	) {}

	replaceQueue(tracks: Array<Track>, startIndex: number): void {
		this.generation += 1;

		if (tracks.length === 0 || startIndex >= tracks.length) {
			this.queue = [];
			this.inProgress = false;
			return;
		}

		const normalizedStartIndex = Math.max(0, Math.min(startIndex, tracks.length - 1));
		const orderedTracks = tracks.slice(normalizedStartIndex);

		const seen = new Set<string>();
		this.queue = orderedTracks.flatMap((track) => {
			if (!track?.id || seen.has(track.id)) {
				return [];
			}

			seen.add(track.id);
			return [{ track, trackId: track.id }];
		});

		this.processNext(this.generation);
	}

	prioritize(track: Track | null | undefined): void {
		if (!track?.id) {
			return;
		}

		const existing = this.queue.filter((entry) => entry.trackId !== track.id);
		this.queue = [{ track, trackId: track.id }, ...existing];
		this.processNext(this.generation);
	}

	clearQueue(): void {
		this.generation += 1;
		this.queue = [];
		this.inProgress = false;
	}

	private processNext(generation: number): void {
		if (this.inProgress || this.queue.length === 0 || generation !== this.generation) {
			return;
		}

		this.inProgress = true;
		// biome-ignore lint/style/noNonNullAssertion: queue length checked above
		const next = this.queue.shift()!;

		setTimeout(() => {
			this.processEntry(next, generation);
		}, 0);
	}

	private processEntry(entry: QueueEntry, generation: number): void {
		if (generation !== this.generation) {
			this.inProgress = false;
			this.processNext(this.generation);
			return;
		}

		if (this.hasCachedTrack(entry.trackId)) {
			this.inProgress = false;
			this.processNext(this.generation);
			return;
		}

		const url = this.resolveTrackUrl(entry.track);
		if (!url) {
			this.onTrackFetchFailed?.(entry.trackId, 'no url');
			this.inProgress = false;
			this.processNext(this.generation);
			return;
		}

		this.cacheTrack(entry.trackId, url, (source) => {
			if (!source || generation !== this.generation) {
				this.onTrackFetchFailed?.(entry.trackId, 'native cache failed');
			} else {
				this.onTrackStored?.(entry.trackId);
			}
			this.inProgress = false;
			this.processNext(this.generation);
		});
	}
}
