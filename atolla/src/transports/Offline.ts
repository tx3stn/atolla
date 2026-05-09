// biome-ignore-all lint/suspicious/useAwait: async used for Transport interface conformance

import { TransportErrors } from '../errors/TransportErrors';
import type { Album } from '../models/Album';
import type { Artist } from '../models/Artist';
import type { Genre } from '../models/Genre';
import type { Playlist } from '../models/Playlist';
import type { SearchResults } from '../models/Search';
import type { Track } from '../models/Track';
import type { DownloadService } from '../services/DownloadService';
import type { PlaylistCreateService } from '../services/PlaylistCreateService';
import type { Transport } from './Transport';

export class OfflineTransport implements Transport {
	private readonly downloads: DownloadService;
	private readonly playlistCreateService: PlaylistCreateService | null;

	constructor(downloads: DownloadService, playlistCreateService?: PlaylistCreateService) {
		this.downloads = downloads;
		this.playlistCreateService = playlistCreateService ?? null;
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
				releaseDate: trackEntry.track.releaseDate,
			});
		}

		return sortAlbumsByDefaultOrder(Array.from(albumsById.values()));
	}

	async getAlbumsByArtist(artistId: string): Promise<Array<Album>> {
		const artistEntry = this.downloads.getArtist(artistId);
		if (artistEntry) {
			const albums = artistEntry.albumIds
				.map((id) => this.downloads.getAlbum(id)?.album)
				.filter((a): a is Album => a != null);
			if (albums.length > 0) {
				return sortAlbumsByDefaultOrder(albums);
			}
		}

		const allAlbums = await this.getAllAlbums();
		return allAlbums.filter((album) => album.artistId === artistId);
	}

	async getAllPlaylists(): Promise<Array<Playlist>> {
		const downloaded = this.downloads.getAllPlaylists().map((e) => e.playlist);
		const pending = this.playlistCreateService?.getPending() ?? [];
		const pendingPlaylists = pending.map((op) => ({ id: op.localId, name: op.name }));
		return [...downloaded, ...pendingPlaylists];
	}

	async createPlaylist(name: string, trackId?: string): Promise<Playlist> {
		if (!this.playlistCreateService) {
			return Promise.reject(new Error(TransportErrors.OFFLINE_PLAYLIST_CREATE_UNAVAILABLE.msg()));
		}
		return this.playlistCreateService.enqueue(name, trackId ?? '');
	}

	async getGenresPage(
		page: number,
		pageSize: number,
	): Promise<{ hasMore: boolean; items: Array<Genre> }> {
		const allGenres = [...this.downloads.getAllGenres()]
			.map((entry) => entry.genre)
			.sort((left, right) => compareNamesCaseInsensitive(left.name, right.name));

		const start = Math.max(0, page - 1) * pageSize;
		const end = start + pageSize;
		return {
			hasMore: end < allGenres.length,
			items: allGenres.slice(start, end),
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

		for (const genreEntry of this.downloads.getAllGenres()) {
			for (const trackId of genreEntry.trackIds) {
				const trackEntry = this.downloads.getTrack(trackId);
				if (!trackEntry || trackEntry.track.artistId !== artistId) {
					continue;
				}

				const genreLogo = genreEntry.trackArtistLogoUrls[trackId];
				if (genreLogo) {
					return genreLogo;
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
				return sortTracksByNumber(tracks);
			}
		}

		return sortTracksByNumber(
			this.downloads
				.getAllTracks()
				.filter((entry) => entry.track.albumId === albumId)
				.map((entry) => entry.track),
		);
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

	async getTracksByGenre(genreId: string): Promise<Array<Track>> {
		const genreEntry = this.downloads.getGenre(genreId);
		if (genreEntry) {
			return genreEntry.trackIds
				.map((trackId) => this.downloads.getTrack(trackId)?.track)
				.filter((track): track is Track => track != null);
		}

		return this.downloads
			.getAllTracks()
			.filter((entry) => entry.genreIds.includes(genreId))
			.map((entry) => entry.track);
	}

	async getTracksByGenrePage(
		genreId: string,
		page: number,
		pageSize: number,
	): Promise<{ hasMore: boolean; items: Array<Track>; totalCount: number }> {
		const allTracks = await this.getTracksByGenre(genreId);
		const start = Math.max(0, page - 1) * pageSize;
		const end = start + pageSize;
		return {
			hasMore: end < allTracks.length,
			items: allTracks.slice(start, end),
			totalCount: allTracks.length,
		};
	}

	async getTracksByPlaylist(playlistId: string): Promise<Array<Track>> {
		if (this.playlistCreateService) {
			const pending = this.playlistCreateService.getPending();
			const localEntry = pending.find((op) => op.localId === playlistId);
			if (localEntry) {
				if (!localEntry.trackId) return [];
				const trackEntry = this.downloads.getTrack(localEntry.trackId);
				return trackEntry ? [trackEntry.track] : [];
			}
		}

		const playlistEntry = this.downloads.getPlaylist(playlistId);
		if (!playlistEntry) return [];
		return playlistEntry.trackIds
			.map((id) => this.downloads.getTrack(id)?.track)
			.filter((t): t is Track => t != null);
	}

	async getRandomAlbum(): Promise<Album | null> {
		const albums = await this.getAllAlbums();
		if (albums.length === 0) {
			return null;
		}
		const index = Math.floor(Math.random() * albums.length);
		return albums[index] ?? null;
	}

	async getShuffledLibraryTracks(): Promise<Array<Track>> {
		const availableTracks = this.downloads
			.getAllTracks()
			.filter((entry) => entry.complete)
			.map((entry) => entry.track);
		return shuffleTracks(availableTracks);
	}

	async getShuffledLibraryTracksPage(
		page: number,
		pageSize: number,
	): Promise<{ hasMore: boolean; items: Array<Track> }> {
		const allTracks = this.downloads
			.getAllTracks()
			.filter((entry) => entry.complete)
			.map((entry) => entry.track)
			.sort((a, b) => a.id.localeCompare(b.id));
		const start = Math.max(0, page - 1) * pageSize;
		const end = start + pageSize;
		return {
			hasMore: end < allTracks.length,
			items: allTracks.slice(start, end),
		};
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

function sortTracksByNumber(tracks: Array<Track>): Array<Track> {
	return [...tracks].sort((a, b) => (a.trackNumber ?? 0) - (b.trackNumber ?? 0));
}

function sortAlbumsByDefaultOrder(albums: Array<Album>): Array<Album> {
	return [...albums].sort((left, right) => {
		const byDate = compareDatesDescending(left.releaseDate, right.releaseDate);
		if (byDate !== 0) {
			return byDate;
		}

		return compareNamesCaseInsensitive(left.name, right.name);
	});
}

function compareDatesDescending(left: string | undefined, right: string | undefined): number {
	const leftTime = parseDateTime(left);
	const rightTime = parseDateTime(right);

	if (leftTime == null && rightTime == null) return 0;
	if (leftTime == null) return 1;
	if (rightTime == null) return -1;

	return rightTime - leftTime;
}

function parseDateTime(value: string | undefined): number | null {
	if (!value) {
		return null;
	}

	const time = Date.parse(value);
	if (Number.isNaN(time)) {
		return null;
	}

	return time;
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

function shuffleTracks<T>(tracks: Array<T>): Array<T> {
	const copy = [...tracks];
	for (let i = copy.length - 1; i > 0; i--) {
		const randomIndex = Math.floor(Math.random() * (i + 1));
		[copy[i], copy[randomIndex]] = [copy[randomIndex], copy[i]];
	}
	return copy;
}
