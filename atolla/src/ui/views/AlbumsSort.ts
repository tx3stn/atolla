import type { Album } from '../../models/Album';
export type AlbumSort = 'a-z' | 'z-a' | 'new-old' | 'old-new';

export const AlbumSorts = {
	aToZ: 'a-z' as AlbumSort,
	newToOld: 'new-old' as AlbumSort,
	oldToNew: 'old-new' as AlbumSort,
	zToA: 'z-a' as AlbumSort,
};

export function sortAlbums(albums: Array<Album>, sort: AlbumSort): Array<Album> {
	const sorted = [...albums];
	switch (sort) {
		case AlbumSorts.aToZ:
			return sorted.sort((a, b) => a.name.localeCompare(b.name));
		case AlbumSorts.zToA:
			return sorted.sort((a, b) => b.name.localeCompare(a.name));
		case AlbumSorts.newToOld:
			return sorted.sort((a, b) => compareDatesDescending(a.releaseDate, b.releaseDate));
		case AlbumSorts.oldToNew:
			return sorted.sort((a, b) => compareDatesAscending(a.releaseDate, b.releaseDate));
		default:
			return sorted.sort((a, b) => a.name.localeCompare(b.name));
	}
}

function compareDatesAscending(left: string | undefined, right: string | undefined): number {
	const leftTime = parseDateTime(left);
	const rightTime = parseDateTime(right);

	if (leftTime == null && rightTime == null) return 0;
	if (leftTime == null) return 1;
	if (rightTime == null) return -1;

	return leftTime - rightTime;
}

function compareDatesDescending(left: string | undefined, right: string | undefined): number {
	const leftTime = parseDateTime(left);
	const rightTime = parseDateTime(right);

	if (leftTime == null && rightTime == null) return 0;
	if (leftTime == null) return 1;
	if (rightTime == null) return -1;

	return rightTime - leftTime;
}

function parseDateTime(value: string | undefined): number | null {
	if (!value) {
		return null;
	}

	const time = Date.parse(value);
	if (Number.isNaN(time)) {
		return null;
	}

	return time;
}
