import type { Album } from '../../../models/Album';
import { type SortOrder, SortOrders } from '../../../models/App';
import { compareDatesAscending, compareDatesDescending } from '../../../utils/Date';

export function sortAlbums(albums: Array<Album>, sort: SortOrder): Array<Album> {
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
export function sortArtistAlbums(albums: Array<Album>): Array<Album> {
	return [...albums].sort((a, b) => {
		const byReleaseDate = (b.releaseDate ?? '').localeCompare(a.releaseDate ?? '');
		if (byReleaseDate !== 0) {
			return byReleaseDate;
		}

		const byName = a.name.localeCompare(b.name);
		if (byName !== 0) {
			return byName;
		}

		return a.id.localeCompare(b.id);
	});
}
