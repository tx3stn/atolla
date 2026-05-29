import type { Album } from '../models/Album';
import type { CardDetailItem } from '../ui/components/CardDetailList';

// Pure "On This Day" logic, kept free of any Valdi imports so it can be unit
// tested with bun and reused by OnThisDayService. The `CardDetailItem` import is
// type-only and erased at runtime, so this module never pulls in the component.

interface OnThisDayCandidate {
	album: Album;
	originalReleaseDate: Date;
	originalReleaseYear: number;
}

/**
 * Returns the parsed release date + year when `releaseDate` falls on the same
 * month/day as `target` in an earlier year (an anniversary), or null otherwise.
 * Shared by the discovery sweep (match only) and the card builder (uses the
 * parsed values for "X YEARS AGO" text and sorting).
 */
export function matchOnThisDay(
	releaseDate: string | undefined,
	target: Date,
): { date: Date; year: number } | null {
	if (!releaseDate) {
		return null;
	}

	const date = new Date(releaseDate);
	if (Number.isNaN(date.getTime())) {
		return null;
	}

	const year = date.getFullYear();
	if (year >= target.getFullYear()) {
		return null;
	}

	if (date.getMonth() !== target.getMonth() || date.getDate() !== target.getDate()) {
		return null;
	}

	return { date, year };
}

export function createOnThisDayCardDetails(albums: Array<Album>, now: Date): Array<CardDetailItem> {
	const currentYear = now.getFullYear();

	return albums
		.map((album): OnThisDayCandidate | null => {
			if (!album.name?.trim() || !album.artistName?.trim()) {
				return null;
			}

			const match = matchOnThisDay(album.releaseDate, now);
			if (!match) {
				return null;
			}

			return {
				album,
				originalReleaseDate: match.date,
				originalReleaseYear: match.year,
			};
		})
		.filter((candidate): candidate is OnThisDayCandidate => candidate !== null)
		.sort((left, right) => {
			if (left.originalReleaseYear !== right.originalReleaseYear) {
				return left.originalReleaseYear - right.originalReleaseYear;
			}

			const byName = left.album.name.localeCompare(right.album.name);
			if (byName !== 0) {
				return byName;
			}

			return left.originalReleaseDate.getTime() - right.originalReleaseDate.getTime();
		})
		.map(({ album, originalReleaseYear }) => {
			const yearsAgo = currentYear - originalReleaseYear;
			const yearsAgoText = yearsAgo === 1 ? '1 YEAR AGO' : `${yearsAgo} YEARS AGO`;

			return {
				artworkKey: album.imageUrl ?? '',
				id: album.id,
				kind: 'album',
				lineOne: yearsAgoText,
				lineThree: album.artistName,
				lineTwo: album.name,
			};
		});
}
