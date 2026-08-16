import type { Album } from 'atolla_core/src/models/Album';
import { compareBySortKey } from 'atolla_core/src/utils/SortKey';
import { compareDatesDescending } from '../../../utils/Date';

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
