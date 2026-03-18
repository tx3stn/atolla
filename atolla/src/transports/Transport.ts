import type { Album } from '../models/Album';
import type { Artist } from '../models/Artist';
import type { Playlist } from '../models/Playlist';
import type { Track } from '../models/Track';

export type { Album, Artist, Playlist, Track };

export interface Transport {
	getAlbumsByArtist(artistId: string): Promise<Array<Album>>;
	getAllAlbums(): Promise<Array<Album>>;
	getAllArtists(): Promise<Array<Artist>>;
	getAllPlaylists(): Promise<Array<Playlist>>;
	getTracksByAlbum(albumId: string): Promise<Array<Track>>;
	getTracksByPlaylist(playlistId: string): Promise<Array<Track>>;
}
