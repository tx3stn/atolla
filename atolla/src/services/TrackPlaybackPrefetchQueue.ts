// @ts-nocheck
import type { Track } from '../models/Track';

declare const require: (moduleName: string) => {
	HTTPClient: new (
		baseUrl?: string,
	) => {
		get: (
			pathOrUrl: string,
			headers?: Record<string, string>,
		) => PromiseLike<{
			body?: Uint8Array;
			headers: Record<string, string>;
			statusCode: number;
		}> & { cancel?: () => void };
	};
};

type TrackUrlResolver = (track: Track) => string | null;
type TrackFetcher = (url: string) => Promise<{ buffer: ArrayBuffer; mimeType: string } | null>;

interface QueueEntry {
	track: Track;
	trackId: string;
}

interface TrackPlaybackCacheLike {
	hasTrack(trackId: string): Promise<boolean>;
	storeTrack(trackId: string, value: ArrayBuffer, mimeType?: string): Promise<void>;
}

function defaultFetcher(url: string): Promise<{
	buffer: ArrayBuffer;
	mimeType: string;
} | null> {
	try {
		const { HTTPClient } = require('valdi_http/src/HTTPClient');
		const client = new HTTPClient();
		const request = client.get(url);

		return request
			.then((response) => {
				if (response.statusCode < 200 || response.statusCode >= 300 || !response.body) {
					return null;
				}

				const mimeType = getHeaderValue(response.headers, 'content-type') ?? 'audio/mpeg';
				const bytes = response.body;
				const buffer = bytes.buffer.slice(
					bytes.byteOffset,
					bytes.byteOffset + bytes.byteLength,
				) as ArrayBuffer;
				return { buffer, mimeType };
			})
			.catch(() => null);
	} catch {
		return Promise.resolve(null);
	}
}

function getHeaderValue(headers: Record<string, string>, key: string): string | null {
	const lower = key.toLowerCase();
	for (const [headerKey, headerValue] of Object.entries(headers)) {
		if (headerKey.toLowerCase() === lower) {
			return headerValue;
		}
	}
	return null;
}

export class TrackPlaybackPrefetchQueue {
	private queue: Array<QueueEntry> = [];
	private inProgress = false;
	private generation = 0;

	constructor(
		private readonly cache: TrackPlaybackCacheLike,
		private readonly resolveTrackUrl: TrackUrlResolver,
		private readonly fetchTrack: TrackFetcher = defaultFetcher,
		private readonly onTrackStored?: (trackId: string) => void,
		private readonly onTrackFetchFailed?: (trackId: string) => void,
	) {}

	replaceQueue(tracks: Array<Track>, startIndex: number): void {
		this.generation += 1;

		if (tracks.length === 0) {
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

		const payload = await this.fetchTrack(url);

		if (!payload || generation !== this.generation) {
			this.onTrackFetchFailed?.(entry.trackId);
			return;
		}

		await this.cache.storeTrack(entry.trackId, payload.buffer, payload.mimeType);
		if (await this.cache.hasTrack(entry.trackId)) {
			this.onTrackStored?.(entry.trackId);
			return;
		}

		this.onTrackFetchFailed?.(entry.trackId);
	}
}
