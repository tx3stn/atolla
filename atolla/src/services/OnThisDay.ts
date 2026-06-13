import type { Album } from '../models/Album';
import type { CardDetailItem } from '../models/CardDetailItem';

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

	// PremiereDate is a calendar release date sent as a UTC instant (…T00:00:00Z), so read its
	// day/month/year in UTC — reading the UTC-midnight instant with local getters would shift it
	// to the previous day in timezones behind UTC. `target` is the viewer's local today.
	const year = date.getUTCFullYear();
	if (year >= target.getFullYear()) {
		return null;
	}

	if (date.getUTCMonth() !== target.getMonth() || date.getUTCDate() !== target.getDate()) {
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

			return {
				artworkKey: album.imageUrl ?? '',
				id: album.id,
				kind: 'album',
				lineOne: yearsAgo === 1 ? '1 YEAR AGO' : `${yearsAgo} YEARS AGO`,
				lineThree: album.artistName,
				lineTwo: album.name,
			};
		});
}
