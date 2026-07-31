import type { Genre } from '../../models/Genre';
import { compareBySortKey } from '../../utils/SortKey';

export function normalizeGenres(genres?: Array<Genre> | null): Array<Genre> {
	if (!genres || genres.length === 0) {
		return [];
	}

	const byId = new Map<string, Genre>();
	for (const genre of genres) {
		const genreId = genre?.id?.trim();
		const genreName = genre?.name?.trim();
		if (!genreId || !genreName || byId.has(genreId)) {
			continue;
		}

		byId.set(genreId, {
			id: genreId,
			name: genreName,
			sortName: genre.sortName,
		});
	}

	return [...byId.values()].sort(compareBySortKey);
}

export function mergeGenreCollections(
	collections: Array<Array<Genre> | null | undefined>,
): Array<Genre> {
	return normalizeGenres(collections.flatMap((collection) => collection ?? []));
}
