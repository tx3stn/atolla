// biome-ignore-all lint/suspicious/useAwait: async used for Transport interface conformance

import { TransportErrors } from '../errors/TransportErrors';
import type { Album } from '../models/Album';
import type { Artist } from '../models/Artist';
import type { Playlist } from '../models/Playlist';
import type { SearchResults } from '../models/Search';
import type { Track } from '../models/Track';
import type { DownloadService } from '../services/DownloadService';
import type { Transport } from './Transport';

export class OfflineTransport implements Transport {
	private readonly downloads: DownloadService;

	constructor(downloads: DownloadService) {
		this.downloads = downloads;
	}

	async getAllArtists(): Promise<Array<Artist>> {
		return this.downloads.getAllArtists().map((e) => e.artist);
	}

	async getAllAlbums(): Promise<Array<Album>> {
		return this.downloads.getAllAlbums().map((e) => e.album);
	}

	async getAlbumsByArtist(artistId: string): Promise<Array<Album>> {
		const artistEntry = this.downloads.getArtist(artistId);
		if (!artistEntry) return [];
		return artistEntry.albumIds
			.map((id) => this.downloads.getAlbum(id)?.album)
			.filter((a): a is Album => a != null);
	}

	async getAllPlaylists(): Promise<Array<Playlist>> {
		return this.downloads.getAllPlaylists().map((e) => e.playlist);
	}

	async getArtist(artistId: string): Promise<Artist | null> {
		const downloadedArtist = this.downloads.getArtist(artistId)?.artist;
		if (downloadedArtist) {
			return downloadedArtist;
		}

		const downloadedAlbum = this.downloads
			.getAllAlbums()
			.find((entry) => entry.album.artistId === artistId);
		if (!downloadedAlbum) {
			return null;
		}

		return {
			id: artistId,
			logoUrl: downloadedAlbum.artistLogoUrl ?? undefined,
			name: downloadedAlbum.album.artistName,
		};
	}

	async getArtistLogoUrl(artistId: string): Promise<string | null> {
		const artistEntry = this.downloads.getArtist(artistId);
		if (artistEntry) {
			for (const albumId of artistEntry.albumIds) {
				const albumEntry = this.downloads.getAlbum(albumId);
				if (albumEntry?.artistLogoUrl) return albumEntry.artistLogoUrl;
			}
		}

		for (const albumEntry of this.downloads.getAllAlbums()) {
			if (albumEntry.album.artistId === artistId && albumEntry.artistLogoUrl) {
				return albumEntry.artistLogoUrl;
			}
		}

		for (const playlistEntry of this.downloads.getAllPlaylists()) {
			for (const trackId of playlistEntry.trackIds) {
				const trackEntry = this.downloads.getTrack(trackId);
				if (!trackEntry || trackEntry.track.artistId !== artistId) {
					continue;
				}

				const playlistLogo = playlistEntry.trackArtistLogoUrls[trackId];
				if (playlistLogo) {
					return playlistLogo;
				}
			}
		}

		return null;
	}

	async getArtistTopTracks(artistId: string): Promise<Array<Track>> {
		return this.downloads
			.getAllTracks()
			.filter((e) => e.track.artistId === artistId && e.complete)
			.map((e) => e.track);
	}

	async getTracksByAlbum(albumId: string): Promise<Array<Track>> {
		const albumEntry = this.downloads.getAlbum(albumId);
		if (!albumEntry) return [];
		return albumEntry.trackIds
			.map((id) => this.downloads.getTrack(id)?.track)
			.filter((t): t is Track => t != null);
	}

	async getTracksByArtist(artistId: string): Promise<Array<Track>> {
		const artistEntry = this.downloads.getArtist(artistId);
		if (!artistEntry) return [];
		const tracks: Array<Track> = [];
		for (const albumId of artistEntry.albumIds) {
			const albumEntry = this.downloads.getAlbum(albumId);
			if (!albumEntry) continue;
			for (const trackId of albumEntry.trackIds) {
				const trackEntry = this.downloads.getTrack(trackId);
				if (trackEntry) tracks.push(trackEntry.track);
			}
		}
		return tracks;
	}

	async getTracksByPlaylist(playlistId: string): Promise<Array<Track>> {
		const playlistEntry = this.downloads.getPlaylist(playlistId);
		if (!playlistEntry) return [];
		return playlistEntry.trackIds
			.map((id) => this.downloads.getTrack(id)?.track)
			.filter((t): t is Track => t != null);
	}

	getTrackCacheUrl(trackId: string): string | null {
		if (!this.downloads.isTrackDownloaded(trackId)) return null;
		return this.downloads.getTrackPlaybackUrl(trackId);
	}

	async search(query: string): Promise<SearchResults> {
		const q = query.toLowerCase();
		const match = (name: string) => name.toLowerCase().includes(q);

		return {
			albums: this.downloads
				.getAllAlbums()
				.filter((e) => match(e.album.name))
				.map((e) => e.album),
			artists: this.downloads
				.getAllArtists()
				.filter((e) => match(e.artist.name))
				.map((e) => e.artist),
			playlists: this.downloads
				.getAllPlaylists()
				.filter((e) => match(e.playlist.name))
				.map((e) => e.playlist),
			tracks: this.downloads
				.getAllTracks()
				.filter((e) => e.complete && match(e.track.name))
				.map((e) => e.track),
		};
	}

	async scrobbleTrackPlayed(_trackId: string, _datePlayed: string): Promise<void> {
		return Promise.reject(new Error(TransportErrors.OFFLINE_SCROBBLE_UNAVAILABLE.msg()));
	}
}
