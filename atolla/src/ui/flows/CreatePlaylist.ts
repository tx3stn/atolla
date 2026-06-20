interface PlaylistLike {
	id: string;
}

interface TrackLike {
	id: string;
}

export interface QueueTrackSelection {
	includePlayed: boolean;
	includeUpNext: boolean;
}

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
	addItemToPlaylist: ((playlistId: string, trackId: string) => Promise<void>) | undefined,
	tracks: Array<TrackLike>,
): Promise<TPlaylist> {
	const playlist = await createPlaylist(name);
	await addTracksToPlaylist(playlist.id, tracks, addItemToPlaylist);
	return playlist;
}

export async function addTracksToPlaylist(
	playlistId: string,
	tracks: Array<TrackLike>,
	addItemToPlaylist: ((playlistId: string, trackId: string) => Promise<void>) | undefined,
): Promise<void> {
	if (addItemToPlaylist && tracks.length > 0) {
		await tracks.reduce<Promise<void>>(
			(chain, track) => chain.then(() => addItemToPlaylist(playlistId, track.id)),
			Promise.resolve(),
		);
	}
}
