import { describe, expect, it } from 'bun:test';
import type { Album } from '../../../models/Album';
import { SortOrders } from '../../../models/App';
import { sortAlbums, sortArtistAlbums } from './Albums';

const albums: Array<Album> = [
	{ artistId: 'a1', artistName: 'Artist', id: '1', name: 'Album A', releaseDate: '2022-01-01' },
	{ artistId: 'a1', artistName: 'Artist', id: '2', name: 'Album B', releaseDate: '2024-01-01' },
	{ artistId: 'a1', artistName: 'Artist', id: '3', name: 'Album C' },
	{ artistId: 'a1', artistName: 'Artist', id: '4', name: 'Album D', releaseDate: '2023-01-01' },
];

describe('sortAlbums', () => {
	it('sorts new-old by releaseDate and keeps missing releaseDate last', () => {
		const sorted = sortAlbums(albums, SortOrders.newToOld);

		expect(sorted.map((album) => album.name)).toEqual(['Album B', 'Album D', 'Album A', 'Album C']);
	});

	it('sorts old-new by releaseDate and keeps missing releaseDate last', () => {
		const sorted = sortAlbums(albums, SortOrders.oldToNew);

		expect(sorted.map((album) => album.name)).toEqual(['Album A', 'Album D', 'Album B', 'Album C']);
	});
});

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
