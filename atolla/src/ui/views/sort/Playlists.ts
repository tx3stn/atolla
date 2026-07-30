import type { Playlist } from '../../../models/Playlist';

export function sortPlaylists(playlists: Array<Playlist>): Array<Playlist> {
	return sortAlphabetically([...playlists]);
}

function sortAlphabetically(playlists: Array<Playlist>): Array<Playlist> {
	return playlists.sort((a, b) => a.name.localeCompare(b.name));
}
