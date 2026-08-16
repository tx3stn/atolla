import type { Playlist } from 'atolla_core/src/models/Playlist';
import { compareBySortKey } from 'atolla_core/src/utils/SortKey';

export function sortPlaylists(playlists: Array<Playlist>): Array<Playlist> {
	return [...playlists].sort(compareBySortKey);
}
