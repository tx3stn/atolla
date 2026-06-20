import type { Genre } from '../../models/Genre';
import type { Transport } from '../../transports/Transport';
import { TRACK_PAGE_SIZE } from '../pagination/Grid';

const MAX_GENRE_PAGES = 20;

export interface GenreLookupTransport {
	getGenresPage: Transport['getGenresPage'];
}

export async function resolveGenreForNavigation(
	transport: GenreLookupTransport,
	genre: Genre,
): Promise<Genre> {
	if (genre.imageUrl) {
		return genre;
	}

	let page = 1;
	let hasMore = true;

	while (hasMore && page <= MAX_GENRE_PAGES) {
		let result: { hasMore: boolean; items: Array<Genre> };
		try {
			result = await transport.getGenresPage(page, TRACK_PAGE_SIZE);
		} catch {
			return genre;
		}

		const found = result.items.find((candidate) => candidate.id === genre.id);
		if (found) {
			return {
				...genre,
				...found,
			};
		}

		hasMore = result.hasMore;
		page += 1;
	}

	return genre;
}

export async function resolveGenreImageUrls(
	transport: GenreLookupTransport,
	genres: Array<Genre>,
): Promise<Array<Genre>> {
	const deduped = [...new Map(genres.map((g) => [g.id, g])).values()];
	const resolved = new Map<string, Genre>(deduped.map((g) => [g.id, g]));
	const unresolved = new Set(deduped.filter((g) => !g.imageUrl).map((g) => g.id));

	let page = 1;
	let hasMore = true;
	while (hasMore && unresolved.size > 0 && page <= MAX_GENRE_PAGES) {
		let result: { hasMore: boolean; items: Array<Genre> };
		try {
			result = await transport.getGenresPage(page, TRACK_PAGE_SIZE);
		} catch {
			break;
		}
		for (const fetched of result.items) {
			if (unresolved.has(fetched.id) && fetched.imageUrl) {
				resolved.set(fetched.id, { ...resolved.get(fetched.id), ...fetched });
				unresolved.delete(fetched.id);
			}
		}
		hasMore = result.hasMore;
		page += 1;
	}

	return Array.from(resolved.values());
}
