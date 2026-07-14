import type { TrackSource } from '../../services/TrackSource';

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

export async function createPlaylistAndAddTracks<TPlaylist extends PlaylistLike>(
	name: string,
	createPlaylist: (name: string) => Promise<TPlaylist>,
	addItems: AddItems,
	tracks: TrackSource,
	options?: PagedAddOptions,
): Promise<TPlaylist> {
	const playlist = await createPlaylist(name);
	await addTracksToPlaylist(playlist.id, tracks, addItems, options);
	return playlist;
}

// streams the tracks a page at a time, adding each page in one bulk request; re-checks
// isCancelled between pages so a dismissed/destroyed consumer stops promptly
export async function addTracksToPlaylist(
	playlistId: string,
	tracks: TrackSource,
	addItems: AddItems,
	options?: PagedAddOptions,
): Promise<void> {
	const pageSize = options?.pageSize ?? DEFAULT_ADD_PAGE_SIZE;
	let page = 1;
	while (true) {
		if (options?.isCancelled?.()) return;
		const { hasMore, items } = await tracks(page, pageSize);
		if (options?.isCancelled?.()) return;
		if (items.length > 0) {
			await addItems(
				playlistId,
				items.map((track) => track.id),
			);
		}
		if (!hasMore) return;
		page += 1;
	}
}
