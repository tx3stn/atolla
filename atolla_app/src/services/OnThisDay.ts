import type { Album } from 'atolla_core/src/models/Album';
import { compareBySortKey } from 'atolla_core/src/utils/SortKey';
import type { CardDetailItem } from '../models/App';

export interface OnThisDayCandidate {
	album: Album;
	originalReleaseDate: Date;
	originalReleaseYear: number;
}

// parsed release date + year when releaseDate is an anniversary of target (same
// month/day, earlier year), else null. shared by the discovery sweep (match only)
// and the card builder (which uses the parsed values for "X YEARS AGO" and sorting)
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

	// PremiereDate is a calendar date sent as a UTC instant (…T00:00:00Z), so read its
	// day/month/year in UTC: local getters would shift it back a day in timezones behind
	// UTC. target is the viewer's local today
	const year = date.getUTCFullYear();
	if (year >= target.getFullYear()) {
		return null;
	}

	if (date.getUTCMonth() !== target.getMonth() || date.getUTCDate() !== target.getDate()) {
		return null;
	}

	return { date, year };
}

export function selectOnThisDayCandidates(
	albums: Array<Album>,
	now: Date,
): Array<OnThisDayCandidate> {
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

			const byName = compareBySortKey(left.album, right.album);
			if (byName !== 0) {
				return byName;
			}

			return left.originalReleaseDate.getTime() - right.originalReleaseDate.getTime();
		});
}

export function createOnThisDayCardDetails(albums: Array<Album>, now: Date): Array<CardDetailItem> {
	const currentYear = now.getFullYear();

	return selectOnThisDayCandidates(albums, now).map(({ album, originalReleaseYear }) => {
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
