import type { CancelablePromise } from 'valdi_core/src/CancelablePromise';
import type { Album } from '../models/Album';
import type { Artist } from '../models/Artist';
import type { Genre } from '../models/Genre';
import type { Playlist } from '../models/Playlist';
import type { SearchResults } from '../models/Search';
import type { Track } from '../models/Track';

// how a paged track collection should be ordered. 'random' reshuffles per request, so
// consecutive pages can overlap — consumers that stitch pages together must de-dupe
export type TrackPageSort = 'default' | 'random';

export interface Transport {
	addItemsToPlaylist(playlistId: string, trackIds: Array<string>): Promise<void>;
	createPlaylist(name: string, trackId?: string): Promise<Playlist>;
	getAlbumReleaseDates(
		page: number,
		pageSize: number,
	): CancelablePromise<{ hasMore: boolean; items: Array<{ id: string; releaseDate?: string }> }>;
	getAlbums(
		page: number,
		pageSize: number,
		options?: { startsWith?: string },
	): CancelablePromise<{ hasMore: boolean; items: Array<Album> }>;
	getAlbumsByArtist(artistId: string): CancelablePromise<Array<Album>>;
	getAlbumsByIds(ids: Array<string>): CancelablePromise<Array<Album>>;
	getArtist(artistId: string): CancelablePromise<Artist | null>;
	getArtistLogoUrl(artistId: string): CancelablePromise<string | null>;
	getArtists(
		page: number,
		pageSize: number,
		options?: { startsWith?: string },
	): CancelablePromise<{ hasMore: boolean; items: Array<Artist> }>;
	getArtistTopTracks(artistId: string): CancelablePromise<Array<Track>>;
	getGenre(genreId: string): CancelablePromise<Genre | null>;
	getGenres(
		page: number,
		pageSize: number,
	): CancelablePromise<{ hasMore: boolean; items: Array<Genre> }>;
	getPlaylist(playlistId: string): CancelablePromise<Playlist | null>;
	getPlaylists(
		page: number,
		pageSize: number,
		options?: { startsWith?: string },
	): CancelablePromise<{ hasMore: boolean; items: Array<Playlist> }>;
	getRandomAlbum(): CancelablePromise<Album | null>;
	getRandomMusicYears(limit: number): CancelablePromise<Array<number>>;
	getRecentlyAddedAlbums(limit: number): CancelablePromise<Array<Album>>;
	getShuffledLibraryTracks(
		page: number,
		pageSize: number,
	): CancelablePromise<{ hasMore: boolean; items: Array<Track> }>;
	getTrackCacheUrl(trackId: string): string | null;
	getTracksByAlbum(albumId: string): CancelablePromise<Array<Track>>;
	getTracksByArtist(artistId: string): CancelablePromise<Array<Track>>;
	getTracksByGenre(
		genreId: string,
		page: number,
		pageSize: number,
		options?: { sort?: TrackPageSort },
	): CancelablePromise<{ hasMore: boolean; items: Array<Track>; totalCount: number }>;
	getTracksByPlaylist(
		playlistId: string,
		page: number,
		pageSize: number,
		options?: { sort?: TrackPageSort },
	): CancelablePromise<{ hasMore: boolean; items: Array<Track>; totalCount?: number }>;
	getTracksByYear(
		year: number,
		page: number,
		pageSize: number,
	): CancelablePromise<{ hasMore: boolean; items: Array<Track> }>;
	movePlaylistTrack(playlistId: string, trackId: string, toIndex: number): Promise<void>;
	removePlaylistTrack(playlistId: string, trackId: string): Promise<void>;
	scrobbleTrackPlayed(trackId: string, datePlayed: string): Promise<void>;
	search(query: string): CancelablePromise<SearchResults>;
}
