import type { Track } from 'atolla_core/src/models/Track';
import {
	type CancelablePromise,
	promiseToCancelablePromise,
} from 'valdi_core/src/CancelablePromise';

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

export function chainSources(sources: Array<TrackSource>): TrackSource {
	let index = 0;
	let sourcePage = 1;

	return (_page, pageSize) => {
		const source = sources[index];
		if (!source) {
			return Promise.resolve({ hasMore: false, items: [] });
		}

		const read = source(sourcePage, pageSize);
		return promiseToCancelablePromise(
			Promise.resolve(read).then(({ hasMore, items }) => {
				if (hasMore) {
					sourcePage += 1;
				} else {
					index += 1;
					sourcePage = 1;
				}
				return { hasMore: hasMore || index < sources.length, items };
			}),
			() => read.cancel?.(),
		);
	};
}
