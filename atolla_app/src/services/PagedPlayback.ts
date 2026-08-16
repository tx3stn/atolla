import type { Track } from '../models/Track';
import { ShuffleQueueLoader } from './ShuffleQueueLoader';
import type { TrackSource } from './TrackSource';

interface PagedPlaybackStore {
	addToQueue(tracks: Array<Track>): void;
	playTracks(tracks: Array<Track>, startIndex: number): void;
	setQueueFiller(filler: { dispose(): void } | null): void;
	subscribe(listener: () => void): () => void;
	trackIndex: number;
	tracks: Array<Track>;
}

// plays a collection without materialising it: queue the first page straight away, then let a
// paged loader backfill as the queue drains. what has been paged into a view must never bound
// what plays, so callers pass a transport-backed source rather than their rendered tracks
export function startPagedPlayback(
	store: PagedPlaybackStore,
	tracks: TrackSource,
	pageSize: number,
): void {
	tracks(1, pageSize).then(
		(result) => {
			if (result.items.length === 0) {
				return;
			}

			store.playTracks(result.items, 0);

			if (result.hasMore) {
				const loader = new ShuffleQueueLoader(store, tracks, pageSize);
				loader.start(2, true);
				store.setQueueFiller(loader);
			}
		},
		() => {},
	);
}
