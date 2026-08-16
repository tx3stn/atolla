import type { Album } from './Album';
import type { Artist } from './Artist';
import type { Playlist } from './Playlist';
import type { Track } from './Track';

export interface SearchResults {
	albums: Array<Album>;
	artists: Array<Artist>;
	playlists: Array<Playlist>;
	tracks: Array<Track>;
}
