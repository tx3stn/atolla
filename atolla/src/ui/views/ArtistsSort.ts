import type { Artist } from '../../models/Artist';

export const ArtistSorts = {
	alphabetical: 'alphabetical',
} as const;

export type ArtistSort = (typeof ArtistSorts)[keyof typeof ArtistSorts];

export function sortArtists(artists: Array<Artist>, sort: ArtistSort): Array<Artist> {
	switch (sort) {
		case ArtistSorts.alphabetical:
			return [...artists].sort((a, b) => a.name.localeCompare(b.name));
	}
}
