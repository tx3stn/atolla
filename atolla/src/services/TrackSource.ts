import type { Track } from '../models/Track';

export interface TrackPage {
	hasMore: boolean;
	items: Array<Track>;
}

// the single currency for "a collection of tracks" — a paged fetcher. Used by playback
// (queue backfill), add-to-playlist, and the create-from-queue flow so nothing has to
// materialise a whole (potentially huge) collection up front.
export type TrackSource = (page: number, pageSize: number) => Promise<TrackPage>;

// wraps a bounded one-shot fetch (album/artist tracks) as a single-page source
export function singlePage(fetch: () => Promise<Array<Track>>): TrackSource {
	return (page) =>
		page <= 1
			? fetch().then((items) => ({ hasMore: false, items }))
			: Promise.resolve({ hasMore: false, items: [] });
}

// wraps an already-materialised array (e.g. the play queue) as a single-page source
export function pagedFromArray(tracks: Array<Track>): TrackSource {
	return singlePage(() => Promise.resolve(tracks));
}
