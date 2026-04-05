// @ts-nocheck
import type { Track } from '../models/Track';

type TrackUrlResolver = (track: Track) => string | null;
type TrackFetcher = (url: string, signal?: AbortSignal) => Promise<ArrayBuffer | null>;

interface QueueEntry {
	track: Track;
	trackId: string;
}

interface TrackPlaybackCacheLike {
	hasTrack(trackId: string): Promise<boolean>;
	storeTrack(trackId: string, value: ArrayBuffer): Promise<void>;
}

function defaultFetcher(url: string, signal?: AbortSignal): Promise<ArrayBuffer | null> {
	return fetch(url, { signal })
		.then((response) => {
			if (!response.ok) {
				return null;
			}
			return response.arrayBuffer();
		})
		.catch(() => null);
}

export class TrackPlaybackPrefetchQueue {
	private queue: Array<QueueEntry> = [];
	private inProgress = false;
	private generation = 0;
	private activeAbortController: AbortController | null = null;

	constructor(
		private readonly cache: TrackPlaybackCacheLike,
		private readonly resolveTrackUrl: TrackUrlResolver,
		private readonly fetchTrack: TrackFetcher = defaultFetcher,
	) {}

	replaceQueue(tracks: Array<Track>, startIndex: number): void {
		this.generation += 1;
		this.activeAbortController?.abort();

		if (tracks.length === 0) {
			this.queue = [];
			this.inProgress = false;
			return;
		}

		const normalizedStartIndex = Math.max(0, Math.min(startIndex, tracks.length - 1));
		const orderedTracks = [
			...tracks.slice(normalizedStartIndex),
			...tracks.slice(0, normalizedStartIndex),
		];

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
		this.activeAbortController?.abort();
		this.inProgress = false;
	}

	private processNext(generation: number): void {
		if (this.inProgress || this.queue.length === 0 || generation !== this.generation) {
			return;
		}

		this.inProgress = true;
		// biome-ignore lint/style/noNonNullAssertion: queue length checked above
		const next = this.queue.shift()!;

		void this.processEntry(next, generation).finally(() => {
			this.inProgress = false;
			if (generation === this.generation) {
				this.processNext(generation);
				return;
			}
			this.processNext(this.generation);
		});
	}

	private async processEntry(entry: QueueEntry, generation: number): Promise<void> {
		if (generation !== this.generation) {
			return;
		}

		if (await this.cache.hasTrack(entry.trackId)) {
			return;
		}

		const url = this.resolveTrackUrl(entry.track);
		if (!url) {
			return;
		}

		const abortController = new AbortController();
		this.activeAbortController = abortController;
		const buffer = await this.fetchTrack(url, abortController.signal);
		this.activeAbortController = null;

		if (!buffer || generation !== this.generation) {
			return;
		}

		await this.cache.storeTrack(entry.trackId, buffer);
	}
}
