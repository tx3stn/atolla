import type { Playlist } from '../../models/Playlist';

export const PlaylistSorts = {
	alphabetical: 'alphabetical',
} as const;

export type PlaylistSort = (typeof PlaylistSorts)[keyof typeof PlaylistSorts];

export function sortPlaylists(playlists: Array<Playlist>, sort: PlaylistSort): Array<Playlist> {
	switch (sort) {
		case PlaylistSorts.alphabetical:
			return [...playlists].sort((a, b) => a.name.localeCompare(b.name));
	}
}
