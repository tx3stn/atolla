import type { Album } from '../../../models/Album';
import { compareDatesDescending } from '../../../utils/Date';
import { compareBySortKey } from '../../../utils/SortKey';

export function sortAlbums(albums: Array<Album>): Array<Album> {
	return sortNewToOld([...albums]);
}

export function sortArtistAlbums(albums: Array<Album>): Array<Album> {
	return [...albums].sort((a, b) => {
		const byReleaseDate = (b.releaseDate ?? '').localeCompare(a.releaseDate ?? '');
		if (byReleaseDate !== 0) {
			return byReleaseDate;
		}

		const byName = compareBySortKey(a, b);
		if (byName !== 0) {
			return byName;
		}

		return a.id.localeCompare(b.id);
	});
}

function sortNewToOld(albums: Array<Album>): Array<Album> {
	return albums.sort((a, b) => compareDatesDescending(a.releaseDate, b.releaseDate));
}
