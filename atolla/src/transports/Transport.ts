import type { Album } from '../models/Album';
import type { Artist } from '../models/Artist';
import type { Playlist } from '../models/Playlist';
import type { SearchResults } from '../models/Search';
import type { Track } from '../models/Track';

export interface Transport {
	getAlbumsByArtist(artistId: string): Promise<Array<Album>>;
	getAlbumsPage?: (
		page: number,
		pageSize: number,
	) => Promise<{ hasMore: boolean; items: Array<Album> }>;
	getAllAlbums(): Promise<Array<Album>>;
	getAllArtists(): Promise<Array<Artist>>;
	getAllPlaylists(): Promise<Array<Playlist>>;
	getArtist(artistId: string): Promise<Artist | null>;
	getArtistLogoUrl(artistId: string): Promise<string | null>;
	getArtistsPage?: (
		page: number,
		pageSize: number,
	) => Promise<{ hasMore: boolean; items: Array<Artist> }>;
	getArtistTopTracks(artistId: string): Promise<Array<Track>>;
	getPlaylistsPage?: (
		page: number,
		pageSize: number,
	) => Promise<{ hasMore: boolean; items: Array<Playlist> }>;
	getTracksByAlbum(albumId: string): Promise<Array<Track>>;
	getTracksByArtist(artistId: string): Promise<Array<Track>>;
	getTracksByPlaylist(playlistId: string): Promise<Array<Track>>;
	search(query: string): Promise<SearchResults>;
}
