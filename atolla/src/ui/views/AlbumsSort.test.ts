import { describe, expect, it } from 'bun:test';
import type { Album } from '../../models/Album';
import { AlbumSorts, sortAlbums } from './AlbumsSort';

const albums: Array<Album> = [
	{ artistId: 'a1', artistName: 'Artist', id: '1', name: 'Album A', releaseDate: '2022-01-01' },
	{ artistId: 'a1', artistName: 'Artist', id: '2', name: 'Album B', releaseDate: '2024-01-01' },
	{ artistId: 'a1', artistName: 'Artist', id: '3', name: 'Album C' },
	{ artistId: 'a1', artistName: 'Artist', id: '4', name: 'Album D', releaseDate: '2023-01-01' },
];

describe('sortAlbums', () => {
	it('sorts new-old by releaseDate and keeps missing releaseDate last', () => {
		const sorted = sortAlbums(albums, AlbumSorts.newToOld);

		expect(sorted.map((album) => album.name)).toEqual(['Album B', 'Album D', 'Album A', 'Album C']);
	});

	it('sorts old-new by releaseDate and keeps missing releaseDate last', () => {
		const sorted = sortAlbums(albums, AlbumSorts.oldToNew);

		expect(sorted.map((album) => album.name)).toEqual(['Album A', 'Album D', 'Album B', 'Album C']);
	});
});
