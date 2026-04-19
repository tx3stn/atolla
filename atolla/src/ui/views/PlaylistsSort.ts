import type { Playlist } from '../../models/Playlist';
import { type SortOrder, SortOrders } from '../components/SortNavPanel';

export type PlaylistSort = SortOrder;
export { SortOrders as PlaylistSorts };

export function sortPlaylists(playlists: Array<Playlist>, sort: SortOrder): Array<Playlist> {
	const sorted = [...playlists];
	switch (sort) {
		case SortOrders.zToA:
			return sorted.sort((a, b) => b.name.localeCompare(a.name));
		case SortOrders.newToOld:
			return sorted.sort((a, b) => compareDates(b.dateAdded, a.dateAdded));
		case SortOrders.oldToNew:
			return sorted.sort((a, b) => compareDates(a.dateAdded, b.dateAdded));
		default:
			return sorted.sort((a, b) => a.name.localeCompare(b.name));
	}
}

function compareDates(a: string | undefined, b: string | undefined): number {
	if (!a && !b) return 0;
	if (!a) return 1;
	if (!b) return -1;
	return a < b ? -1 : a > b ? 1 : 0;
}
