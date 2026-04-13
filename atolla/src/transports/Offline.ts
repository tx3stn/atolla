// biome-ignore-all lint/suspicious/useAwait: async used for Transport interface conformance

import { TransportErrors } from '../errors/TransportErrors';
import type { Album } from '../models/Album';
import type { Artist } from '../models/Artist';
import type { Genre } from '../models/Genre';
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
		const artistsById = new Map<string, Artist>();

		for (const entry of this.downloads.getAllArtists()) {
			artistsById.set(entry.artist.id, entry.artist);
		}

		for (const albumEntry of this.downloads.getAllAlbums()) {
			const artistId = albumEntry.album.artistId;
			if (!artistId) {
				continue;
			}

			const existing = artistsById.get(artistId);
			if (existing) {
				if (!existing.logoUrl && albumEntry.artistLogoUrl) {
					artistsById.set(artistId, { ...existing, logoUrl: albumEntry.artistLogoUrl });
				}
				continue;
			}

			artistsById.set(artistId, {
				id: artistId,
				logoUrl: albumEntry.artistLogoUrl ?? undefined,
				name: albumEntry.album.artistName,
			});
		}

		for (const trackEntry of this.downloads.getAllTracks()) {
			const artistId = trackEntry.track.artistId;
			if (!artistId) {
				continue;
			}

			if (!artistsById.has(artistId)) {
				artistsById.set(artistId, {
					id: artistId,
					name: trackEntry.track.artistName ?? 'Unknown Artist',
				});
			}
		}

		return sortArtistsByName(Array.from(artistsById.values()));
	}

	async getAllAlbums(): Promise<Array<Album>> {
		const albumsById = new Map<string, Album>();

		for (const entry of this.downloads.getAllAlbums()) {
			albumsById.set(entry.album.id, entry.album);
		}

		for (const trackEntry of this.downloads.getAllTracks()) {
			const { albumId } = trackEntry.track;
			if (!albumId || albumsById.has(albumId)) {
				continue;
			}

			albumsById.set(albumId, {
				artistId: trackEntry.track.artistId ?? '',
				artistName: trackEntry.track.artistName ?? '',
				id: albumId,
				imageUrl: trackEntry.track.albumImageUrl,
				name: trackEntry.track.albumName ?? 'Unknown Album',
			});
		}

		return sortAlbumsByName(Array.from(albumsById.values()));
	}

	async getAlbumsByArtist(artistId: string): Promise<Array<Album>> {
		const artistEntry = this.downloads.getArtist(artistId);
		if (artistEntry) {
			const albums = artistEntry.albumIds
				.map((id) => this.downloads.getAlbum(id)?.album)
				.filter((a): a is Album => a != null);
			if (albums.length > 0) {
				return albums;
			}
		}

		const allAlbums = await this.getAllAlbums();
		return allAlbums.filter((album) => album.artistId === artistId);
	}

	async getAllPlaylists(): Promise<Array<Playlist>> {
		return this.downloads.getAllPlaylists().map((e) => e.playlist);
	}

	async getGenresPage(
		_page: number,
		_pageSize: number,
	): Promise<{ hasMore: boolean; items: Array<Genre> }> {
		return {
			hasMore: false,
			items: [],
		};
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
			const downloadedTrack = this.downloads
				.getAllTracks()
				.find((entry) => entry.track.artistId === artistId);
			if (!downloadedTrack) {
				return null;
			}

			return {
				id: artistId,
				name: downloadedTrack.track.artistName ?? 'Unknown Artist',
			};
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
		if (albumEntry) {
			const tracks = albumEntry.trackIds
				.map((id) => this.downloads.getTrack(id)?.track)
				.filter((t): t is Track => t != null);
			if (tracks.length > 0) {
				return tracks;
			}
		}

		return this.downloads
			.getAllTracks()
			.filter((entry) => entry.track.albumId === albumId)
			.map((entry) => entry.track);
	}

	async getTracksByArtist(artistId: string): Promise<Array<Track>> {
		const artistEntry = this.downloads.getArtist(artistId);
		if (artistEntry) {
			const tracks: Array<Track> = [];
			for (const albumId of artistEntry.albumIds) {
				const albumEntry = this.downloads.getAlbum(albumId);
				if (!albumEntry) continue;
				for (const trackId of albumEntry.trackIds) {
					const trackEntry = this.downloads.getTrack(trackId);
					if (trackEntry) tracks.push(trackEntry.track);
				}
			}

			if (tracks.length > 0) {
				return tracks;
			}
		}

		return this.downloads
			.getAllTracks()
			.filter((entry) => entry.track.artistId === artistId)
			.map((entry) => entry.track);
	}

	async getTracksByGenre(_genreId: string): Promise<Array<Track>> {
		return [];
	}

	async getTracksByGenrePage(
		_genreId: string,
		_page: number,
		_pageSize: number,
	): Promise<{ hasMore: boolean; items: Array<Track>; totalCount: number }> {
		return {
			hasMore: false,
			items: [],
			totalCount: 0,
		};
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

function sortAlbumsByName(albums: Array<Album>): Array<Album> {
	return [...albums].sort((left, right) => compareNamesCaseInsensitive(left.name, right.name));
}

function sortArtistsByName(artists: Array<Artist>): Array<Artist> {
	return [...artists].sort((left, right) =>
		compareNamesIgnoringLeadingTheCaseInsensitive(left.name, right.name),
	);
}

function compareNamesCaseInsensitive(left: string, right: string): number {
	const leftLower = left.trim().toLocaleLowerCase();
	const rightLower = right.trim().toLocaleLowerCase();
	if (leftLower < rightLower) {
		return -1;
	}
	if (leftLower > rightLower) {
		return 1;
	}
	return 0;
}

function compareNamesIgnoringLeadingTheCaseInsensitive(left: string, right: string): number {
	const normalizedLeft = normalizeLeadingThe(left);
	const normalizedRight = normalizeLeadingThe(right);
	const byNormalized = compareNamesCaseInsensitive(normalizedLeft, normalizedRight);
	if (byNormalized !== 0) {
		return byNormalized;
	}

	return compareNamesCaseInsensitive(left, right);
}

function normalizeLeadingThe(name: string): string {
	const trimmed = name.trim();
	if (!/^the\s+/i.test(trimmed)) {
		return trimmed;
	}

	return trimmed.replace(/^the\s+/i, '');
}
