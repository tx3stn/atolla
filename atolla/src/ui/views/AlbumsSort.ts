import type { Album } from '../../models/Album';
import { type SortOrder, SortOrders } from '../components/SortNavPanel';

export type AlbumSort = SortOrder;
export { SortOrders as AlbumSorts };

export function sortAlbums(albums: Array<Album>, sort: SortOrder): Array<Album> {
	const sorted = [...albums];
	switch (sort) {
		case SortOrders.aToZ:
			return sorted.sort((a, b) => a.name.localeCompare(b.name));
		case SortOrders.zToA:
			return sorted.sort((a, b) => b.name.localeCompare(a.name));
		case SortOrders.newToOld:
			return sorted.sort((a, b) => compareDates(b.releaseDate, a.releaseDate));
		case SortOrders.oldToNew:
			return sorted.sort((a, b) => compareDates(a.releaseDate, b.releaseDate));
		default:
			return sorted.sort((a, b) => a.name.localeCompare(b.name));
	}
}

function compareDates(a: string | undefined, b: string | undefined): number {
	if (!a && !b) return 0;
	if (!a) return 1;
	if (!b) return -1;
	return a.localeCompare(b);
}
