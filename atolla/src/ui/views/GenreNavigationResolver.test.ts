import { describe, expect, it } from 'bun:test';
import type { Genre } from '../../models/Genre';
import { type GenreLookupTransport, resolveGenreForNavigation } from './GenreNavigationResolver';

function createTransport(
	pages: Record<number, { hasMore: boolean; items: Array<Genre> }>,
	onGetGenresPage?: (page: number, pageSize: number) => void,
): GenreLookupTransport {
	return {
		getGenresPage: (page: number, pageSize: number) => {
			onGetGenresPage?.(page, pageSize);
			return Promise.resolve(pages[page] ?? { hasMore: false, items: [] });
		},
	};
}

describe('resolveGenreForNavigation', () => {
	it('returns input genre when image is already present', async () => {
		const calls: Array<number> = [];
		const transport = createTransport({}, (page) => calls.push(page));

		const resolved = await resolveGenreForNavigation(transport, {
			id: 'genre-1',
			imageUrl: 'https://img/genre-1.jpg',
			name: 'Post-Hardcore',
		});

		expect(resolved.imageUrl).toBe('https://img/genre-1.jpg');
		expect(calls).toEqual([]);
	});

	it('resolves matching genre from paged genre endpoint', async () => {
		const calls: Array<number> = [];
		const transport = createTransport(
			{
				1: {
					hasMore: true,
					items: [{ id: 'genre-2', name: 'Noise Rock' }],
				},
				2: {
					hasMore: false,
					items: [{ id: 'genre-1', imageUrl: 'https://img/genre-1.jpg', name: 'Post-Hardcore' }],
				},
			},
			(page) => calls.push(page),
		);

		const resolved = await resolveGenreForNavigation(transport, {
			id: 'genre-1',
			name: 'Post-Hardcore',
		});

		expect(resolved).toEqual({
			id: 'genre-1',
			imageUrl: 'https://img/genre-1.jpg',
			name: 'Post-Hardcore',
		});
		expect(calls).toEqual([1, 2]);
	});

	it('falls back to original genre when transport lookup fails', async () => {
		const transport: GenreLookupTransport = {
			getGenresPage: () => {
				throw new Error('network failed');
			},
		};

		const input = { id: 'genre-1', name: 'Post-Hardcore' };
		const resolved = await resolveGenreForNavigation(transport, input);

		expect(resolved).toEqual(input);
	});
});
