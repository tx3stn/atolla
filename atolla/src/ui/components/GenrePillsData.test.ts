import { describe, expect, it } from 'bun:test';
import { mergeGenreCollections, normalizeGenres } from './GenrePillsData';

describe('GenrePillsData', () => {
	it('normalizes genres by trimming, deduping and sorting', () => {
		expect(
			normalizeGenres([
				{ id: ' genre-2 ', name: ' Noise Rock ' },
				{ id: 'genre-1', name: 'Post-Hardcore' },
				{ id: 'genre-2', name: 'Duplicate' },
			]),
		).toEqual([
			{ id: 'genre-2', name: 'Noise Rock' },
			{ id: 'genre-1', name: 'Post-Hardcore' },
		]);
	});

	it('drops genres with missing identifiers or names', () => {
		expect(
			normalizeGenres([
				{ id: '', name: 'Missing Id' },
				{ id: 'genre-1', name: '' },
				{ id: 'genre-2', name: 'Valid Genre' },
			]),
		).toEqual([{ id: 'genre-2', name: 'Valid Genre' }]);
	});

	it('merges genre collections across album and artist sources', () => {
		expect(
			mergeGenreCollections([
				[
					{ id: 'genre-2', name: 'Noise Rock' },
					{ id: 'genre-1', name: 'Post-Hardcore' },
				],
				undefined,
				[
					{ id: 'genre-3', name: 'Industrial' },
					{ id: 'genre-2', name: 'Noise Rock' },
				],
			]),
		).toEqual([
			{ id: 'genre-3', name: 'Industrial' },
			{ id: 'genre-2', name: 'Noise Rock' },
			{ id: 'genre-1', name: 'Post-Hardcore' },
		]);
	});
});
