import { compareBySortKey } from 'atolla_core/src/utils/SortKey';
import type { LidarrAlbum } from './Models';

export interface UpcomingAlbum {
	artistName: string;
	coverUrl?: string;
	id: string;
	releaseDate: string;
	title: string;
}

export function toUpcomingAlbums(albums: Array<LidarrAlbum>): Array<UpcomingAlbum> {
	const upcoming: Array<UpcomingAlbum> = [];
	for (const album of albums) {
		const artistName = album.artist?.artistName;
		if (!album.title || !artistName || !album.releaseDate) {
			continue;
		}
		const coverUrl = album.images?.find((image) => image.coverType === 'cover')?.remoteUrl;
		upcoming.push({
			artistName,
			coverUrl: coverUrl ?? undefined,
			id: String(album.id),
			releaseDate: album.releaseDate,
			title: album.title,
		});
	}

	return upcoming.sort(
		(a, b) =>
			a.releaseDate.localeCompare(b.releaseDate) ||
			compareBySortKey({ name: a.artistName }, { name: b.artistName }),
	);
}
