// biome-ignore-all lint/suspicious/useAwait: async used for Transport interface conformance

import type { Album } from 'atolla_core/src/models/Album';
import type { Artist } from 'atolla_core/src/models/Artist';
import type { Genre } from 'atolla_core/src/models/Genre';
import type { Lyrics } from 'atolla_core/src/models/Lyrics';
import type { Playlist } from 'atolla_core/src/models/Playlist';
import type { SearchResults } from 'atolla_core/src/models/Search';
import type { Track } from 'atolla_core/src/models/Track';
import { trackReleaseYear } from 'atolla_core/src/models/Track';
import { TransportErrors } from 'atolla_core/src/transports/Errors';
import type {
	InstantMixSeed,
	TrackPageSort,
	Transport,
} from 'atolla_core/src/transports/Transport';
import { mergeGenreCollections } from 'atolla_core/src/utils/Genres';
import { compareBySortKey } from 'atolla_core/src/utils/SortKey';
import type { DownloadService } from '../services/DownloadService';
import { buildInstantMix, type InstantMixLibrary } from '../services/InstantMix';
import type { PlaylistCreateService } from '../services/PlaylistCreateService';
import type { PlaylistEditService } from '../services/PlaylistEditService';

export class OfflineTransport implements Transport {
	private readonly downloads: DownloadService;
	private readonly playlistCreateService: PlaylistCreateService;
	private readonly playlistEditService: PlaylistEditService | null;

	constructor(
		downloads: DownloadService,
		playlistCreateService: PlaylistCreateService,
		playlistEditService?: PlaylistEditService,
	) {
		this.downloads = downloads;
		this.playlistCreateService = playlistCreateService;
		this.playlistEditService = playlistEditService ?? null;
	}

	async addItemsToPlaylist(playlistId: string, trackIds: Array<string>): Promise<void> {
		const playlistName = this.resolvePlaylistName(playlistId);
		for (const trackId of trackIds) {
			this.playlistEditService?.enqueue({ playlistId, playlistName, trackId, type: 'add' });
		}
	}

	async createPlaylist(name: string, trackId?: string): Promise<Playlist> {
		return this.playlistCreateService.enqueue(name, trackId ?? '');
	}

	async getAlbumReleaseDates(
		page: number,
		pageSize: number,
	): Promise<{ hasMore: boolean; items: Array<{ id: string; releaseDate?: string }> }> {
		const all = this.collectAllAlbums();
		const startIndex = Math.max(0, page - 1) * pageSize;
		const slice = all.slice(startIndex, startIndex + Math.max(1, pageSize));
		return {
			hasMore: startIndex + slice.length < all.length,
			items: slice.map((album) => ({ id: album.id, releaseDate: album.releaseDate })),
		};
	}

	async getAlbumsByArtist(artistId: string): Promise<Array<Album>> {
		const albumsById = new Map<string, Album>();

		for (const album of this.collectAllAlbums()) {
			if (album.artistId === artistId) {
				albumsById.set(album.id, album);
			}
		}

		for (const albumId of this.downloads.getArtist(artistId)?.albumIds ?? []) {
			const album = this.downloads.getAlbum(albumId)?.album;
			if (album && !albumsById.has(albumId)) {
				albumsById.set(albumId, normalizeAlbum(album));
			}
		}

		return sortAlbumsByDefaultOrder([...albumsById.values()]);
	}

	async getAlbumsByIds(ids: Array<string>): Promise<Array<Album>> {
		const wanted = new Set(ids);
		return this.collectAllAlbums().filter((album) => wanted.has(album.id));
	}

	async getAlbums(
		page: number,
		pageSize: number,
		_options?: { startsWith?: string },
	): Promise<{ hasMore: boolean; items: Array<Album> }> {
		return singleLocalPage(this.collectAllAlbums(), page, pageSize);
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

	async getArtists(
		page: number,
		pageSize: number,
		_options?: { startsWith?: string },
	): Promise<{ hasMore: boolean; items: Array<Artist> }> {
		// downloaded data is local and bounded, so the offline grid loads the full
		// list as a single page; the view's render-layer letter filter narrows it
		return singleLocalPage(this.collectAllArtists(), page, pageSize);
	}

	async getArtistTopTracks(artistId: string): Promise<Array<Track>> {
		return this.downloads
			.getAllTracks()
			.filter((e) => e.track.artistId === artistId && e.complete)
			.map((e) => e.track);
	}

	async getGenre(genreId: string): Promise<Genre | null> {
		return this.downloads.getGenre(genreId)?.genre ?? null;
	}

	async getGenres(
		page: number,
		pageSize: number,
	): Promise<{ hasMore: boolean; items: Array<Genre> }> {
		const allGenres = [...this.downloads.getAllGenres()]
			.map((entry) => entry.genre)
			.sort(compareBySortKey);

		const start = Math.max(0, page - 1) * pageSize;
		const end = start + pageSize;
		return {
			hasMore: end < allGenres.length,
			items: allGenres.slice(start, end),
		};
	}

	async getInstantMix(seed: InstantMixSeed, limit: number): Promise<Array<Track>> {
		return buildInstantMix(seed, this.instantMixLibrary(), { limit });
	}

	async getLyrics(_trackId: string): Promise<Lyrics | null> {
		return null;
	}

	async getPlaylist(playlistId: string): Promise<Playlist | null> {
		return this.downloads.getPlaylist(playlistId)?.playlist ?? null;
	}

	async getPlaylists(
		page: number,
		pageSize: number,
		_options?: { startsWith?: string },
	): Promise<{ hasMore: boolean; items: Array<Playlist> }> {
		return singleLocalPage(this.collectAllPlaylists(), page, pageSize);
	}

	async getRandomAlbum(): Promise<Album | null> {
		const albums = this.collectAllAlbums();
		if (albums.length === 0) {
			return null;
		}
		const index = Math.floor(Math.random() * albums.length);
		return albums[index] ?? null;
	}

	async getRandomMusicYears(limit: number): Promise<Array<number>> {
		const years = new Set<number>();
		for (const entry of this.downloads.getAllTracks()) {
			if (!entry.complete) {
				continue;
			}
			const year = trackReleaseYear(entry.track);
			if (year != null) {
				years.add(year);
			}
		}

		return shuffleTracks([...years]).slice(0, Math.max(0, limit));
	}

	async getRecentlyAddedAlbums(limit: number): Promise<Array<Album>> {
		return [...this.collectAllAlbums()]
			.sort((a, b) => compareDatesDescending(a.addedDate, b.addedDate))
			.slice(0, Math.max(1, limit));
	}

	async getShuffledLibraryTracks(
		page: number,
		pageSize: number,
	): Promise<{ hasMore: boolean; items: Array<Track> }> {
		const allTracks = shuffleTracks(
			this.downloads
				.getAllTracks()
				.filter((entry) => entry.complete)
				.map((entry) => entry.track),
		);
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

	async getTracksByAlbum(albumId: string): Promise<Array<Track>> {
		const albumEntry = this.downloads.getAlbum(albumId);
		if (albumEntry) {
			const tracks = this.completedTracks(albumEntry.trackIds);
			if (tracks.length > 0) {
				return sortTracksByNumber(tracks);
			}
		}

		return sortTracksByNumber(
			this.downloads
				.getAllTracks()
				.filter((entry) => entry.track.albumId === albumId && entry.complete)
				.map((entry) => entry.track),
		);
	}

	async getTracksByArtist(artistId: string): Promise<Array<Track>> {
		const trackIds = new Set(
			(this.downloads.getArtist(artistId)?.albumIds ?? []).flatMap(
				(albumId) => this.downloads.getAlbum(albumId)?.trackIds ?? [],
			),
		);

		for (const entry of this.downloads.getAllTracks()) {
			if (entry.track.artistId === artistId) {
				trackIds.add(entry.track.id);
			}
		}

		return this.completedTracks([...trackIds]);
	}

	async getTracksByGenre(
		genreId: string,
		page: number,
		pageSize: number,
		options?: { sort?: TrackPageSort },
	): Promise<{ hasMore: boolean; items: Array<Track>; totalCount: number }> {
		const collected = await this.collectGenreTracks(genreId);
		const allTracks = options?.sort === 'random' ? shuffleTracks(collected) : collected;
		const start = Math.max(0, page - 1) * pageSize;
		const end = start + pageSize;
		return {
			hasMore: end < allTracks.length,
			items: allTracks.slice(start, end),
			totalCount: allTracks.length,
		};
	}

	async getTracksByPlaylist(
		playlistId: string,
		page: number,
		pageSize: number,
		options?: { sort?: TrackPageSort },
	): Promise<{ hasMore: boolean; items: Array<Track>; totalCount?: number }> {
		const all = await this.collectPlaylistTracks(playlistId);
		return singleLocalPage(options?.sort === 'random' ? shuffleTracks(all) : all, page, pageSize);
	}

	async getTracksByYear(
		year: number,
		page: number,
		pageSize: number,
	): Promise<{ hasMore: boolean; items: Array<Track> }> {
		const yearTracks = this.downloads
			.getAllTracks()
			.filter((entry) => entry.complete && trackReleaseYear(entry.track) === year)
			.map((entry) => entry.track)
			.sort((a, b) => a.id.localeCompare(b.id));
		const start = Math.max(0, page - 1) * pageSize;
		const end = start + pageSize;
		return {
			hasMore: end < yearTracks.length,
			items: yearTracks.slice(start, end),
		};
	}

	async movePlaylistTrack(playlistId: string, trackId: string, toIndex: number): Promise<void> {
		const playlistName = this.resolvePlaylistName(playlistId);
		this.playlistEditService?.enqueue({ playlistId, playlistName, toIndex, trackId, type: 'move' });
	}

	async removePlaylistTrack(playlistId: string, trackId: string): Promise<void> {
		const playlistName = this.resolvePlaylistName(playlistId);
		this.playlistEditService?.enqueue({ playlistId, playlistName, trackId, type: 'remove' });
	}

	async scrobbleTrackPlayed(_trackId: string, _datePlayed: string): Promise<void> {
		return Promise.reject(TransportErrors.OFFLINE_SCROBBLE);
	}

	async search(query: string): Promise<SearchResults> {
		const q = query.toLowerCase();
		const match = (name: string) => name.toLowerCase().includes(q);

		return {
			albums: this.collectAllAlbums().filter((album) => match(album.name)),
			artists: this.collectAllArtists().filter((artist) => match(artist.name)),
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

	private collectAllAlbums(): Array<Album> {
		const albumsById = new Map<string, Album>();

		for (const entry of this.downloads.getAllAlbums()) {
			const metadata = this.downloads.getAlbumMetadata(entry.album.id);
			albumsById.set(
				entry.album.id,
				normalizeAlbum(metadata ? { ...metadata, ...entry.album } : entry.album),
			);
		}

		// downloads made before album metadata was recorded have no album record to read
		// genres from, so they come from the tracks themselves
		const genresByAlbumId = new Map<string, Array<Genre>>();
		for (const trackEntry of this.downloads.getAllTracks()) {
			const { albumId, genres } = trackEntry.track;
			if (!trackEntry.complete || !albumId || albumsById.has(albumId) || !genres?.length) {
				continue;
			}

			genresByAlbumId.set(albumId, mergeGenreCollections([genresByAlbumId.get(albumId), genres]));
		}

		for (const trackEntry of this.downloads.getAllTracks()) {
			const { albumId } = trackEntry.track;
			if (!trackEntry.complete || !albumId || albumsById.has(albumId)) {
				continue;
			}

			const metadata = this.downloads.getAlbumMetadata(albumId);
			if (metadata) {
				albumsById.set(albumId, normalizeAlbum(metadata));
				continue;
			}

			albumsById.set(albumId, {
				artistId: trackEntry.track.artistId ?? '',
				artistName: trackEntry.track.artistName ?? '',
				genres: genresByAlbumId.get(albumId),
				id: albumId,
				imageUrl: trackEntry.track.albumImageUrl,
				name: trackEntry.track.albumName ?? 'Unknown Album',
				releaseDate: trackEntry.track.releaseDate,
			});
		}

		return sortAlbumsByDefaultOrder(Array.from(albumsById.values()));
	}

	private collectAllArtists(): Array<Artist> {
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
			if (!trackEntry.complete || !artistId) {
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

	private collectAllPlaylists(): Array<Playlist> {
		const downloaded = this.downloads.getAllPlaylists().map((e) => e.playlist);
		const pending = this.playlistCreateService?.getPending() ?? [];
		const pendingPlaylists = pending.map((op) => ({ id: op.localId, name: op.name }));
		return [...downloaded, ...pendingPlaylists];
	}

	private async collectGenreTracks(genreId: string): Promise<Array<Track>> {
		const genreEntry = this.downloads.getGenre(genreId);
		if (genreEntry) {
			return sortTracksByName(this.completedTracks(genreEntry.trackIds));
		}

		return sortTracksByName(
			this.downloads
				.getAllTracks()
				.filter((entry) => entry.genreIds.includes(genreId) && entry.complete)
				.map((entry) => entry.track),
		);
	}

	private async collectPlaylistTracks(playlistId: string): Promise<Array<Track>> {
		let trackIds: Array<string>;

		if (this.playlistCreateService) {
			const pending = this.playlistCreateService.getPending();
			const localEntry = pending.find((op) => op.localId === playlistId);
			if (localEntry) {
				trackIds = localEntry.trackId ? [localEntry.trackId] : [];
			} else {
				trackIds = this.downloads.getPlaylist(playlistId)?.trackIds ?? [];
			}
		} else {
			trackIds = this.downloads.getPlaylist(playlistId)?.trackIds ?? [];
		}

		if (this.playlistEditService) {
			const ops = await this.playlistEditService.getPendingOpsForPlaylist(playlistId);
			for (const op of ops) {
				if (op.type === 'add') {
					if (!trackIds.includes(op.trackId)) {
						trackIds = [...trackIds, op.trackId];
					}
				} else if (op.type === 'remove') {
					trackIds = trackIds.filter((id) => id !== op.trackId);
				} else if (op.type === 'move') {
					const from = trackIds.indexOf(op.trackId);
					if (from >= 0) {
						const reordered = [...trackIds];
						reordered.splice(from, 1);
						reordered.splice(op.toIndex, 0, op.trackId);
						trackIds = reordered;
					}
				}
			}
		}

		return this.completedTracks(trackIds);
	}

	// tracks that are actually downloaded (cached); failed/pending tracks are omitted so
	// offline listings and playback queues never include an unplayable entry
	private completedTracks(trackIds: Array<string>): Array<Track> {
		const tracks: Array<Track> = [];
		for (const id of trackIds) {
			const entry = this.downloads.getTrack(id);
			if (entry?.complete) {
				tracks.push(entry.track);
			}
		}
		return tracks;
	}

	private instantMixLibrary(): InstantMixLibrary {
		return {
			albums: this.downloads.getAllAlbums().map((entry) => ({
				genreIds: entry.album.genres?.map((genre) => genre.id) ?? [],
				id: entry.album.id,
				trackIds: entry.trackIds,
			})),
			artists: this.downloads.getAllArtists().map((entry) => ({
				albumIds: entry.albumIds,
				id: entry.artist.id,
			})),
			genres: this.downloads.getAllGenres().map((entry) => ({
				id: entry.genre.id,
				trackIds: entry.trackIds,
			})),
			playlists: this.downloads.getAllPlaylists().map((entry) => ({
				id: entry.playlist.id,
				trackIds: entry.trackIds,
			})),
			tracks: this.downloads
				.getAllTracks()
				.filter((entry) => entry.complete)
				.map((entry) => entry.track),
		};
	}

	private resolvePlaylistName(playlistId: string): string {
		return (
			this.downloads.getPlaylist(playlistId)?.playlist.name ??
			this.playlistCreateService?.getPending().find((p) => p.localId === playlistId)?.name ??
			''
		);
	}
}

// jellyfin's SortName for an audio item is disc/track-number prefixed, not the title, so
// track ordering compares names directly rather than going through compareBySortKey
function sortTracksByName(tracks: Array<Track>): Array<Track> {
	return [...tracks].sort((left, right) => {
		const byName = compareTrackNames(left.name, right.name);
		if (byName !== 0) {
			return byName;
		}

		return left.id.localeCompare(right.id);
	});
}

function compareTrackNames(left: string, right: string): number {
	const leftKey = left.trim().toLowerCase();
	const rightKey = right.trim().toLowerCase();

	if (leftKey < rightKey) {
		return -1;
	}
	if (leftKey > rightKey) {
		return 1;
	}

	return 0;
}

function sortTracksByNumber(tracks: Array<Track>): Array<Track> {
	return [...tracks].sort((a, b) => (a.trackNumber ?? 0) - (b.trackNumber ?? 0));
}

// offline collections are local and bounded, so paginated reads return the whole list
// as one page (page 1) with hasMore:false, satisfying the Transport contract without
// truly paging downloaded data
function singleLocalPage<T>(
	items: Array<T>,
	page: number,
	pageSize: number,
): { hasMore: boolean; items: Array<T> } {
	const startIndex = Math.max(0, page - 1) * pageSize;
	if (startIndex > 0) {
		return { hasMore: false, items: [] };
	}
	return { hasMore: false, items };
}

// persisted album records can predate current metadata rules (or come from an
// incomplete download), so typed string fields may be missing at runtime. guarantee
// non-null text before the render thread: a null album name/artist renders into a
// native <label> and crashes
function normalizeAlbum(album: Album): Album {
	return {
		...album,
		artistName: album.artistName || '',
		name: album.name || 'Unknown Album',
	};
}

function sortAlbumsByDefaultOrder(albums: Array<Album>): Array<Album> {
	return [...albums].sort((left, right) => {
		const byDate = compareDatesDescending(left.releaseDate, right.releaseDate);
		if (byDate !== 0) {
			return byDate;
		}

		return compareBySortKey(left, right);
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
	return [...artists].sort(compareBySortKey);
}

function shuffleTracks<T>(tracks: Array<T>): Array<T> {
	const copy = [...tracks];
	for (let i = copy.length - 1; i > 0; i--) {
		const randomIndex = Math.floor(Math.random() * (i + 1));
		[copy[i], copy[randomIndex]] = [copy[randomIndex], copy[i]];
	}
	return copy;
}
