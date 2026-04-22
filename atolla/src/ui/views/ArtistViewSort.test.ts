import { describe, expect, it } from 'bun:test';
import type { Album } from '../../models/Album';
import { sortArtistAlbums } from './ArtistViewSort';

describe('sortArtistAlbums', () => {
	it('sorts by release date descending', () => {
		const albums: Array<Album> = [
			{ artistId: 'a', artistName: 'A', id: '1', name: 'B', releaseDate: '2022-01-01' },
			{ artistId: 'a', artistName: 'A', id: '2', name: 'A', releaseDate: '2024-01-01' },
			{ artistId: 'a', artistName: 'A', id: '3', name: 'C', releaseDate: '2023-01-01' },
		];

		expect(sortArtistAlbums(albums).map((a) => a.id)).toEqual(['2', '3', '1']);
	});

	it('uses deterministic tie-breakers for same or missing release date', () => {
		const albums: Array<Album> = [
			{ artistId: 'a', artistName: 'A', id: '3', name: 'Beta' },
			{ artistId: 'a', artistName: 'A', id: '1', name: 'Alpha' },
			{ artistId: 'a', artistName: 'A', id: '2', name: 'Alpha' },
		];

		expect(sortArtistAlbums(albums).map((a) => a.id)).toEqual(['1', '2', '3']);
	});
});
