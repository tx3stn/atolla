import type { Playlist } from '../../../models/Playlist';
import { compareBySortKey } from '../../../utils/SortKey';

export function sortPlaylists(playlists: Array<Playlist>): Array<Playlist> {
	return [...playlists].sort(compareBySortKey);
}
