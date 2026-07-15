import {
	type CancelablePromise,
	promiseToCancelablePromise,
} from 'valdi_core/src/CancelablePromise';
import type { TrackPage, TrackSource } from '../../services/TrackSource';

interface PlaylistLike {
	id: string;
}

export interface QueueTrackSelection {
	includePlayed: boolean;
	includeUpNext: boolean;
}

export interface PagedAddOptions {
	// re-checked between pages so a dismissed/destroyed consumer stops the add promptly
	isCancelled?: () => boolean;
	pageSize?: number;
}

type AddItems = (playlistId: string, trackIds: Array<string>) => Promise<void>;

const DEFAULT_ADD_PAGE_SIZE = 200;

export function selectQueueTracksForPlaylist<T>(
	tracks: ReadonlyArray<T>,
	currentIndex: number,
	options: QueueTrackSelection,
): Array<T> {
	const current = tracks[currentIndex];
	if (current === undefined) return [];
	const played = options.includePlayed ? tracks.slice(0, currentIndex) : [];
	const upNext = options.includeUpNext ? tracks.slice(currentIndex + 1) : [];
	return [...played, current, ...upNext];
}

// creates the playlist (a mutation that always completes) then streams the tracks in.
// cancelling the returned promise cancels the in-flight add (see addTracksToPlaylist); the
// created playlist is still returned. cancel before the add starts skips it entirely
export function createPlaylistAndAddTracks<TPlaylist extends PlaylistLike>(
	name: string,
	createPlaylist: (name: string) => Promise<TPlaylist>,
	addItems: AddItems,
	tracks: TrackSource,
	options?: PagedAddOptions,
): CancelablePromise<TPlaylist> {
	let add: CancelablePromise<void> | undefined;
	let cancelled = false;

	const run = async (): Promise<TPlaylist> => {
		const playlist = await createPlaylist(name);
		if (!cancelled) {
			add = addTracksToPlaylist(playlist.id, tracks, addItems, options);
			await add;
		}
		return playlist;
	};

	return promiseToCancelablePromise(run(), () => {
		cancelled = true;
		add?.cancel?.();
	});
}

// streams the tracks a page at a time, adding each page in one bulk request; re-checks
// isCancelled between pages so a dismissed/destroyed consumer stops promptly. cancelling
// the returned promise also aborts the current page's in-flight fetch; a write already
// in flight (addItems) still completes
export function addTracksToPlaylist(
	playlistId: string,
	tracks: TrackSource,
	addItems: AddItems,
	options?: PagedAddOptions,
): CancelablePromise<void> {
	let currentFetch: CancelablePromise<TrackPage> | undefined;
	let cancelled = false;

	const run = async (): Promise<void> => {
		const pageSize = options?.pageSize ?? DEFAULT_ADD_PAGE_SIZE;
		let page = 1;
		while (true) {
			if (cancelled || options?.isCancelled?.()) return;
			currentFetch = tracks(page, pageSize);
			let result: TrackPage;
			try {
				result = await currentFetch;
			} catch (error) {
				// cancelling aborts the in-flight fetch, which may reject; treat that as a clean
				// stop, but let a genuine fetch failure surface
				if (cancelled || options?.isCancelled?.()) return;
				throw error;
			}
			currentFetch = undefined;
			if (cancelled || options?.isCancelled?.()) return;
			const { hasMore, items } = result;
			if (items.length > 0) {
				await addItems(
					playlistId,
					items.map((track) => track.id),
				);
			}
			if (!hasMore) return;
			page += 1;
		}
	};

	return promiseToCancelablePromise(run(), () => {
		cancelled = true;
		currentFetch?.cancel?.();
	});
}
