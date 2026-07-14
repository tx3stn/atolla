import type { Album } from '../models/Album';
import type { Artist } from '../models/Artist';
import type { Genre } from '../models/Genre';
import type { Playlist } from '../models/Playlist';
import type { SearchResults } from '../models/Search';
import type { Track } from '../models/Track';

export interface Transport {
	addItemToPlaylist(playlistId: string, trackId: string): Promise<void>;
	createPlaylist(name: string, trackId?: string): Promise<Playlist>;
	getAlbumReleaseDatesPage(
		page: number,
		pageSize: number,
	): Promise<{ hasMore: boolean; items: Array<{ id: string; releaseDate?: string }> }>;
	getAlbumsByArtist(artistId: string): Promise<Array<Album>>;
	getAlbumsByIds(ids: Array<string>): Promise<Array<Album>>;
	getAlbumsPage(
		page: number,
		pageSize: number,
		options?: { startsWith?: string },
	): Promise<{ hasMore: boolean; items: Array<Album> }>;
	getArtist(artistId: string): Promise<Artist | null>;
	getArtistLogoUrl(artistId: string): Promise<string | null>;
	getArtistsPage(
		page: number,
		pageSize: number,
		options?: { startsWith?: string },
	): Promise<{ hasMore: boolean; items: Array<Artist> }>;
	getArtistTopTracks(artistId: string): Promise<Array<Track>>;
	getGenre(genreId: string): Promise<Genre | null>;
	getGenresPage(page: number, pageSize: number): Promise<{ hasMore: boolean; items: Array<Genre> }>;
	getPlaylist(playlistId: string): Promise<Playlist | null>;
	getPlaylistsPage(
		page: number,
		pageSize: number,
		options?: { startsWith?: string },
	): Promise<{ hasMore: boolean; items: Array<Playlist> }>;
	getRandomAlbum(): Promise<Album | null>;
	getRandomMusicYears(limit: number): Promise<Array<number>>;
	getRecentlyAddedAlbums(limit: number): Promise<Array<Album>>;
	getShuffledLibraryTracks(): Promise<Array<Track>>;
	getShuffledLibraryTracksPage(
		page: number,
		pageSize: number,
	): Promise<{ hasMore: boolean; items: Array<Track> }>;
	getTrackCacheUrl(trackId: string): string | null;
	getTracksByAlbum(albumId: string): Promise<Array<Track>>;
	getTracksByArtist(artistId: string): Promise<Array<Track>>;
	getTracksByGenre(genreId: string): Promise<Array<Track>>;
	getTracksByGenrePage(
		genreId: string,
		page: number,
		pageSize: number,
	): Promise<{ hasMore: boolean; items: Array<Track>; totalCount: number }>;
	getTracksByPlaylist(playlistId: string): Promise<Array<Track>>;
	getTracksByPlaylistPage(
		playlistId: string,
		page: number,
		pageSize: number,
	): Promise<{ hasMore: boolean; items: Array<Track>; totalCount?: number }>;
	getTracksByYearPage(
		year: number,
		page: number,
		pageSize: number,
	): Promise<{ hasMore: boolean; items: Array<Track> }>;
	movePlaylistTrack(playlistId: string, trackId: string, toIndex: number): Promise<void>;
	removePlaylistTrack(playlistId: string, trackId: string): Promise<void>;
	scrobbleTrackPlayed(trackId: string, datePlayed: string): Promise<void>;
	search(query: string): Promise<SearchResults>;
}
