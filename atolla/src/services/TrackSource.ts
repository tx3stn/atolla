import {
	type CancelablePromise,
	promiseToCancelablePromise,
} from 'valdi_core/src/CancelablePromise';
import type { Track } from '../models/Track';

export interface TrackPage {
	hasMore: boolean;
	items: Array<Track>;
}

// the single currency for "a collection of tracks" — a paged fetcher. Used by playback
// (queue backfill), add-to-playlist, and the create-from-queue flow so nothing has to
// materialise a whole (potentially huge) collection up front. Cancelable so a consumer
// (add-to-playlist, paged playback) can abort the in-flight page fetch on dismiss/destroy.
export type TrackSource = (page: number, pageSize: number) => CancelablePromise<TrackPage>;

// wraps a bounded one-shot fetch (album/artist tracks) as a single-page source; cancelling
// the page forwards to the underlying fetch
export function singlePage(fetch: () => CancelablePromise<Array<Track>>): TrackSource {
	return (page) => {
		if (page > 1) {
			return Promise.resolve({ hasMore: false, items: [] });
		}
		const read = fetch();
		return promiseToCancelablePromise(
			Promise.resolve(read).then((items) => ({ hasMore: false, items })),
			() => read.cancel?.(),
		);
	};
}

// wraps an already-materialised array (e.g. the play queue) as a single-page source
export function pagedFromArray(tracks: Array<Track>): TrackSource {
	return singlePage(() => Promise.resolve(tracks));
}
