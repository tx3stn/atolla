import type { Artist } from '../../../models/Artist';

export function sortArtists(artists: Array<Artist>): Array<Artist> {
	return sortAlphabetically([...artists]);
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
	return (/^the\s+/i.test(trimmed) ? trimmed.replace(/^the\s+/i, '') : trimmed).toLowerCase();
}

function compareCaseInsensitive(left: string, right: string): number {
	const leftLower = left.trim().toLowerCase();
	const rightLower = right.trim().toLowerCase();
	if (leftLower < rightLower) {
		return -1;
	}
	if (leftLower > rightLower) {
		return 1;
	}
	return 0;
}
