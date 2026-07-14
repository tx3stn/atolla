import { describe, expect, it } from 'bun:test';
import type { Genre } from '../../models/Genre';
import {
	type GenreLookupTransport,
	resolveGenreForNavigation,
	resolveGenreImageUrls,
} from './GenreNavigationResolver';

function createTransport(
	pages: Record<number, { hasMore: boolean; items: Array<Genre> }>,
	onGetGenresPage?: (page: number, pageSize: number) => void,
): GenreLookupTransport {
	return {
		getGenres: (page: number, pageSize: number) => {
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
			getGenres: () => {
				throw new Error('network failed');
			},
		};

		const input = { id: 'genre-1', name: 'Post-Hardcore' };
		const resolved = await resolveGenreForNavigation(transport, input);

		expect(resolved).toEqual(input);
	});
});

describe('resolveGenreImageUrls', () => {
	it('returns genres immediately without fetching when all imageUrls are present', async () => {
		const calls: Array<number> = [];
		const transport = createTransport({}, (page) => calls.push(page));

		const genres = await resolveGenreImageUrls(transport, [
			{ id: 'genre-1', imageUrl: 'https://img/genre-1.jpg', name: 'Post-Hardcore' },
			{ id: 'genre-2', imageUrl: 'https://img/genre-2.jpg', name: 'Noise Rock' },
		]);

		expect(genres.map((g) => g.imageUrl)).toEqual(
			expect.arrayContaining(['https://img/genre-1.jpg', 'https://img/genre-2.jpg']),
		);
		expect(calls).toEqual([]);
	});

	it('fetches pages to resolve missing imageUrls and returns full genre objects', async () => {
		const transport = createTransport({
			1: {
				hasMore: false,
				items: [
					{ id: 'genre-1', imageUrl: 'https://img/genre-1.jpg', name: 'Post-Hardcore' },
					{ id: 'genre-2', imageUrl: 'https://img/genre-2.jpg', name: 'Noise Rock' },
				],
			},
		});

		const genres = await resolveGenreImageUrls(transport, [
			{ id: 'genre-1', name: 'Post-Hardcore' },
			{ id: 'genre-2', name: 'Noise Rock' },
		]);

		expect(genres.map((g) => g.imageUrl)).toEqual(
			expect.arrayContaining(['https://img/genre-1.jpg', 'https://img/genre-2.jpg']),
		);
		expect(genres.every((g) => g.id && g.name)).toBe(true);
	});

	it('deduplicates genres by id', async () => {
		const calls: Array<number> = [];
		const transport = createTransport({}, (page) => calls.push(page));

		const genres = await resolveGenreImageUrls(transport, [
			{ id: 'genre-1', imageUrl: 'https://img/genre-1.jpg', name: 'Post-Hardcore' },
			{ id: 'genre-1', imageUrl: 'https://img/genre-1.jpg', name: 'Post-Hardcore' },
		]);

		expect(genres).toHaveLength(1);
		expect(genres[0].imageUrl).toBe('https://img/genre-1.jpg');
		expect(calls).toEqual([]);
	});

	it('returns empty array for empty input', async () => {
		const transport = createTransport({});
		const genres = await resolveGenreImageUrls(transport, []);
		expect(genres).toEqual([]);
	});

	it('returns partial results when transport fails', async () => {
		const transport: GenreLookupTransport = {
			getGenres: () => Promise.reject(new Error('network failed')),
		};

		const genres = await resolveGenreImageUrls(transport, [
			{ id: 'genre-1', imageUrl: 'https://img/genre-1.jpg', name: 'Post-Hardcore' },
			{ id: 'genre-2', name: 'Noise Rock' },
		]);

		expect(genres.map((g) => g.id)).toEqual(expect.arrayContaining(['genre-1', 'genre-2']));
		expect(genres.find((g) => g.id === 'genre-1')?.imageUrl).toBe('https://img/genre-1.jpg');
		expect(genres.find((g) => g.id === 'genre-2')?.imageUrl).toBeUndefined();
	});

	it('stops fetching once all genres are resolved', async () => {
		const calls: Array<number> = [];
		const transport = createTransport(
			{
				1: {
					hasMore: true,
					items: [{ id: 'genre-1', imageUrl: 'https://img/genre-1.jpg', name: 'Post-Hardcore' }],
				},
				2: { hasMore: false, items: [{ id: 'genre-2', name: 'Noise Rock' }] },
			},
			(page) => calls.push(page),
		);

		await resolveGenreImageUrls(transport, [{ id: 'genre-1', name: 'Post-Hardcore' }]);

		expect(calls).toEqual([1]);
	});
});
