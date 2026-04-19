import type { Artist } from '../../models/Artist';

export type ArtistSort = 'a-z' | 'z-a' | 'new-old' | 'old-new';

export const ArtistSorts = {
	aToZ: 'a-z' as ArtistSort,
	newToOld: 'new-old' as ArtistSort,
	oldToNew: 'old-new' as ArtistSort,
	zToA: 'z-a' as ArtistSort,
};

export function sortArtists(artists: Array<Artist>, sort: ArtistSort): Array<Artist> {
	const sorted = [...artists];

	switch (sort) {
		case ArtistSorts.zToA:
			return sortAlphabetically(sorted).reverse();
		case ArtistSorts.newToOld:
			return sorted.sort((a, b) => compareDatesDescending(a.dateAdded, b.dateAdded));
		case ArtistSorts.oldToNew:
			return sorted.sort((a, b) => compareDatesAscending(a.dateAdded, b.dateAdded));
		default:
			return sortAlphabetically(sorted);
	}
}

function sortAlphabetically(artists: Array<Artist>): Array<Artist> {
	return artists.sort((left, right) => {
		const normalizedLeft = normalizeArtistName(left.name);
		const normalizedRight = normalizeArtistName(right.name);
		const byNormalized = compareCaseInsensitive(normalizedLeft, normalizedRight);
		if (byNormalized !== 0) {
			return byNormalized;
		}

		return compareCaseInsensitive(left.name, right.name);
	});
}

function normalizeArtistName(name: string): string {
	const trimmed = name.trim();
	return (/^the\s+/i.test(trimmed) ? trimmed.replace(/^the\s+/i, '') : trimmed).toLocaleLowerCase();
}

function compareCaseInsensitive(left: string, right: string): number {
	const leftLower = left.trim().toLocaleLowerCase();
	const rightLower = right.trim().toLocaleLowerCase();
	if (leftLower < rightLower) {
		return -1;
	}
	if (leftLower > rightLower) {
		return 1;
	}
	return 0;
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
