import type { Album } from '../../models/Album';

export const AlbumSorts = {
	alphabetical: 'alphabetical',
} as const;

export type AlbumSort = (typeof AlbumSorts)[keyof typeof AlbumSorts];

export function sortAlbums(albums: Array<Album>, sort: AlbumSort): Array<Album> {
	switch (sort) {
		case AlbumSorts.alphabetical:
			return [...albums].sort((a, b) => a.name.localeCompare(b.name));
	}
}
