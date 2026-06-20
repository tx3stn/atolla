import { type SortOrder, SortOrders } from '../../../models/App';
import type { Playlist } from '../../../models/Playlist';
import { compareDatesAscending, compareDatesDescending } from '../../../utils/Date';

export function sortPlaylists(playlists: Array<Playlist>, sort: SortOrder): Array<Playlist> {
	const sorted = [...playlists];
	switch (sort) {
		case SortOrders.zToA:
			return sorted.sort((a, b) => b.name.localeCompare(a.name));
		case SortOrders.newToOld:
			return sorted.sort((a, b) => compareDatesDescending(a.dateAdded, b.dateAdded));
		case SortOrders.oldToNew:
			return sorted.sort((a, b) => compareDatesAscending(a.dateAdded, b.dateAdded));
		default:
			return sorted.sort((a, b) => a.name.localeCompare(b.name));
	}
}
