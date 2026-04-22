import type { Album } from '../../models/Album';

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
