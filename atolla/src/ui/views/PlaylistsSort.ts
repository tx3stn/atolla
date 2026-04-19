import type { Playlist } from '../../models/Playlist';
import { type SortOrder, SortOrders } from '../components/SortNavPanel';

export type PlaylistSort = SortOrder;
export { SortOrders as PlaylistSorts };

export function sortPlaylists(playlists: Array<Playlist>, sort: SortOrder): Array<Playlist> {
	const sorted = [...playlists];
	switch (sort) {
		case SortOrders.zToA:
			return sorted.sort((a, b) => b.name.localeCompare(a.name));
		default:
			return sorted.sort((a, b) => a.name.localeCompare(b.name));
	}
}
