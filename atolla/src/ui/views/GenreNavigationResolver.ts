import type { Genre } from '../../models/Genre';
import type { Transport } from '../../transports/Transport';

const GENRE_PAGE_SIZE = 50;
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
			result = await transport.getGenresPage(page, GENRE_PAGE_SIZE);
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
