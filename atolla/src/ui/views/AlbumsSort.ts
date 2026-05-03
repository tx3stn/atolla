import type { Album } from '../../models/Album';
import { type SortOrder, SortOrders } from '../components/SortOrder';
import { compareDatesAscending, compareDatesDescending } from './sortDateUtils';

export type AlbumSort = SortOrder;
export { SortOrders as AlbumSorts };

export function sortAlbums(albums: Array<Album>, sort: AlbumSort): Array<Album> {
	const sorted = [...albums];
	switch (sort) {
		case SortOrders.aToZ:
			return sorted.sort((a, b) => a.name.localeCompare(b.name));
		case SortOrders.zToA:
			return sorted.sort((a, b) => b.name.localeCompare(a.name));
		case SortOrders.newToOld:
			return sorted.sort((a, b) => compareDatesDescending(a.releaseDate, b.releaseDate));
		case SortOrders.oldToNew:
			return sorted.sort((a, b) => compareDatesAscending(a.releaseDate, b.releaseDate));
		default:
			return sorted.sort((a, b) => a.name.localeCompare(b.name));
	}
}
