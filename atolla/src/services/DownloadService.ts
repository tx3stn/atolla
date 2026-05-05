import type { Album } from '../models/Album';
import type { Artist } from '../models/Artist';
import type { Genre } from '../models/Genre';
import type { Playlist } from '../models/Playlist';
import type { Track } from '../models/Track';
import type { ImageCategory } from './ImageCache';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type DownloadState = 'not_downloaded' | 'downloading' | 'downloaded';

export interface DownloadedTrackEntry {
	albumIds: Array<string>;
	complete: boolean;
	genreIds: Array<string>;
	playlistIds: Array<string>;
	streamUrl: string;
	track: Track;
}

export interface DownloadedAlbumEntry {
	album: Album;
	artistLogoUrl: string | null;
	trackIds: Array<string>;
}

export interface DownloadedPlaylistEntry {
	playlist: Playlist;
	trackArtistLogoUrls: Record<string, string | null>;
	trackIds: Array<string>;
}

export interface DownloadedArtistEntry {
	albumIds: Array<string>;
	artist: Artist;
}

export interface DownloadedGenreEntry {
	genre: Genre;
	trackArtistLogoUrls: Record<string, string | null>;
	trackIds: Array<string>;
}

// ---------------------------------------------------------------------------
// Injected interfaces (for testability without native deps)
// ---------------------------------------------------------------------------

export interface DownloadServiceStore {
	fetchString(key: string): Promise<string>;
	storeString(key: string, value: string): Promise<void>;
}

export interface DownloadServiceOptions {
	/** Download a track and persist it locally. */
	cacheTrack: (trackId: string, url: string) => Promise<void>;
	/** Return the total size in bytes of all permanently downloaded tracks. */
	getTotalDownloadedSizeBytes?: () => number;
	/** Return the local playback URL for a previously cached track. */
	getTrackPlaybackUrl: (trackId: string) => string;
	/** Called when a track finishes downloading successfully. */
	onTrackDownloaded?: (trackId: string) => void;
	/** Hint native image cache to persist image assets for offline experience. */
	preloadImages?: (urls: Array<string>, category: ImageCategory) => void;
	/** Remove a previously downloaded track from permanent storage. */
	removeTrack: (trackId: string) => Promise<void> | void;
	/** Remove previously downloaded tracks from permanent storage in bulk. */
	removeTracks?: (trackIds: Array<string>) => Promise<void> | void;
	store: DownloadServiceStore;
}

// ---------------------------------------------------------------------------
// Internal persistence keys (one key per entity type)
// ---------------------------------------------------------------------------

const KEY_ALBUMS = 'dl_albums';
const KEY_GENRES = 'dl_genres';
const KEY_PLAYLISTS = 'dl_playlists';
const KEY_ARTISTS = 'dl_artists';
const KEY_TRACKS = 'dl_tracks';

const MAX_CONCURRENT_DOWNLOADS = 3;

// ---------------------------------------------------------------------------
// DownloadService
// ---------------------------------------------------------------------------

export class DownloadService {
	private albums: Record<string, DownloadedAlbumEntry> = {};
	private genres: Record<string, DownloadedGenreEntry> = {};
	private playlists: Record<string, DownloadedPlaylistEntry> = {};
	private artists: Record<string, DownloadedArtistEntry> = {};
	private tracks: Record<string, DownloadedTrackEntry> = {};

	private isLoaded = false;
	private loadChain: Promise<void> = Promise.resolve();

	private queue: Array<{ trackId: string; streamUrl: string }> = [];
	private activeCount = 0;

	private readonly subscribers = new Set<() => void>();
	private readonly store: DownloadServiceStore;
	private readonly cacheTrackFn: DownloadServiceOptions['cacheTrack'];
	private readonly getTrackPlaybackUrlFn: DownloadServiceOptions['getTrackPlaybackUrl'];
	private readonly getTotalDownloadedSizeBytesFn: DownloadServiceOptions['getTotalDownloadedSizeBytes'];
	private readonly onTrackDownloadedFn: DownloadServiceOptions['onTrackDownloaded'];
	private readonly removeTrackFn: DownloadServiceOptions['removeTrack'];
	private readonly removeTracksFn: DownloadServiceOptions['removeTracks'];
	private readonly preloadImagesFn: DownloadServiceOptions['preloadImages'];

	constructor(options: DownloadServiceOptions) {
		this.store = options.store;
		this.cacheTrackFn = options.cacheTrack;
		this.getTrackPlaybackUrlFn = options.getTrackPlaybackUrl;
		this.getTotalDownloadedSizeBytesFn = options.getTotalDownloadedSizeBytes;
		this.onTrackDownloadedFn = options.onTrackDownloaded;
		this.removeTrackFn = options.removeTrack;
		this.removeTracksFn = options.removeTracks;
		this.preloadImagesFn = options.preloadImages;
	}

	// -------------------------------------------------------------------------
	// Lifecycle
	// -------------------------------------------------------------------------

	onAppReady(): void {
		this.ensureLoaded().then(() => {
			// Re-enqueue any tracks that did not finish downloading.
			for (const entry of Object.values(this.tracks)) {
				if (!entry.complete) {
					this.enqueueTrack(entry.track.id, entry.streamUrl);
				}
			}
			this.notify();
		});
	}

	// -------------------------------------------------------------------------
	// Subscribe
	// -------------------------------------------------------------------------

	subscribe(callback: () => void): () => void {
		this.subscribers.add(callback);
		return () => {
			this.subscribers.delete(callback);
		};
	}

	private notify(): void {
		for (const cb of this.subscribers) {
			cb();
		}
	}

	// -------------------------------------------------------------------------
	// Query
	// -------------------------------------------------------------------------

	getAlbumDownloadState(albumId: string): DownloadState {
		const entry = this.albums[albumId];
		if (!entry) return 'not_downloaded';
		const allComplete = entry.trackIds.every((id) => this.tracks[id]?.complete === true);
		return allComplete ? 'downloaded' : 'downloading';
	}

	getPlaylistDownloadState(playlistId: string): DownloadState {
		const entry = this.playlists[playlistId];
		if (!entry) return 'not_downloaded';
		const allComplete = entry.trackIds.every((id) => this.tracks[id]?.complete === true);
		return allComplete ? 'downloaded' : 'downloading';
	}

	getGenreDownloadState(genreId: string): DownloadState {
		const entry = this.genres[genreId];
		if (!entry) return 'not_downloaded';
		const allComplete = entry.trackIds.every((id) => this.tracks[id]?.complete === true);
		return allComplete ? 'downloaded' : 'downloading';
	}

	getArtistDownloadState(artistId: string): DownloadState {
		const entry = this.artists[artistId];
		if (!entry) return 'not_downloaded';
		const albumStates = entry.albumIds.map((id) => this.getAlbumDownloadState(id));
		if (albumStates.every((s) => s === 'downloaded')) return 'downloaded';
		if (albumStates.some((s) => s !== 'not_downloaded')) return 'downloading';
		return 'not_downloaded';
	}

	/** Number of tracks not yet fully downloaded. Drives the footer badge. */
	getDownloadingCount(): number {
		return Object.values(this.tracks).filter((t) => !t.complete).length;
	}

	/** Number of fully downloaded tracks. */
	getDownloadedTrackCount(): number {
		return Object.values(this.tracks).filter((t) => t.complete).length;
	}

	/** Total size in bytes of all permanently downloaded tracks, or null if unavailable. */
	getTotalDownloadedSizeBytes(): number | null {
		return this.getTotalDownloadedSizeBytesFn?.() ?? null;
	}

	isTrackDownloaded(trackId: string): boolean {
		return this.tracks[trackId]?.complete === true;
	}

	getTrackPlaybackUrl(trackId: string): string {
		return this.getTrackPlaybackUrlFn(trackId);
	}

	// --- Accessors for OfflineTransport ---

	getAllAlbums(): Array<DownloadedAlbumEntry> {
		return Object.values(this.albums);
	}

	getAllPlaylists(): Array<DownloadedPlaylistEntry> {
		return Object.values(this.playlists);
	}

	getAllGenres(): Array<DownloadedGenreEntry> {
		return Object.values(this.genres);
	}

	getAllArtists(): Array<DownloadedArtistEntry> {
		return Object.values(this.artists);
	}

	getAllTracks(): Array<DownloadedTrackEntry> {
		return Object.values(this.tracks);
	}

	getAlbum(albumId: string): DownloadedAlbumEntry | undefined {
		return this.albums[albumId];
	}

	getPlaylist(playlistId: string): DownloadedPlaylistEntry | undefined {
		return this.playlists[playlistId];
	}

	getGenre(genreId: string): DownloadedGenreEntry | undefined {
		return this.genres[genreId];
	}

	getArtist(artistId: string): DownloadedArtistEntry | undefined {
		return this.artists[artistId];
	}

	getTrack(trackId: string): DownloadedTrackEntry | undefined {
		return this.tracks[trackId];
	}

	// -------------------------------------------------------------------------
	// Download actions
	// -------------------------------------------------------------------------

	downloadAlbum(params: {
		album: Album;
		tracks: Array<{ track: Track; streamUrl: string }>;
		artistImageUrl?: string | null;
		artistLogoUrl: string | null;
		resolvedGenres?: Array<Genre>;
	}): void {
		const { album, artistImageUrl, tracks, artistLogoUrl, resolvedGenres = [] } = params;
		this.ensureLoaded().then(async () => {
			this.preloadDownloadImages({
				albumArtUrls: [album.imageUrl, ...tracks.map(({ track }) => track.albumImageUrl)],
				artistImageUrls: [artistImageUrl],
				artistLogoUrls: [artistLogoUrl],
				genreArtUrls: [
					...resolvedGenres.map((g) => g.imageUrl),
					...(album.genres?.map((g) => g.imageUrl) ?? []),
					...tracks.flatMap(({ track }) => (track.genres ?? []).map((g) => g.imageUrl)),
				],
			});

			this.upsertArtistEntry({
				albumIds: [album.id],
				artist: {
					id: album.artistId,
					imageUrl: artistImageUrl ?? undefined,
					logoUrl: artistLogoUrl ?? undefined,
					name: album.artistName,
				},
			});

			this.albums[album.id] = {
				album,
				artistLogoUrl,
				trackIds: tracks.map((t) => t.track.id),
			};
			for (const { track, streamUrl } of tracks) {
				this.addTrackRef(
					track,
					streamUrl,
					album.id,
					null,
					null,
					[...(album.genres ?? []), ...resolvedGenres],
					artistLogoUrl,
				);
			}
			await this.persistAll();

			for (const { track, streamUrl } of tracks) {
				if (!this.tracks[track.id]?.complete) {
					this.enqueueTrack(track.id, streamUrl);
				}
			}
			this.notify();
		});
	}

	downloadPlaylist(params: {
		playlist: Playlist;
		artists?: Array<Artist>;
		tracks: Array<{ track: Track; streamUrl: string; artistLogoUrl: string | null }>;
		resolvedGenres?: Array<Genre>;
	}): void {
		const { artists = [], playlist, tracks, resolvedGenres = [] } = params;
		this.ensureLoaded().then(async () => {
			this.preloadDownloadImages({
				albumArtUrls: [playlist.imageUrl, ...tracks.map(({ track }) => track.albumImageUrl)],
				artistImageUrls: artists.map((artist) => artist.imageUrl),
				artistLogoUrls: tracks.map(({ artistLogoUrl }) => artistLogoUrl),
				genreArtUrls: [
					...resolvedGenres.map((g) => g.imageUrl),
					...tracks.flatMap(({ track }) => (track.genres ?? []).map((g) => g.imageUrl)),
				],
			});

			for (const artist of artists) {
				this.upsertArtistEntry({
					albumIds: [],
					artist,
				});
			}

			const trackArtistLogoUrls: Record<string, string | null> = {};
			for (const { track, artistLogoUrl } of tracks) {
				trackArtistLogoUrls[track.id] = artistLogoUrl;
			}
			this.playlists[playlist.id] = {
				playlist,
				trackArtistLogoUrls,
				trackIds: tracks.map((t) => t.track.id),
			};
			for (const { artistLogoUrl, streamUrl, track } of tracks) {
				this.addTrackRef(
					track,
					streamUrl,
					null,
					null,
					playlist.id,
					[...(track.genres ?? []), ...resolvedGenres],
					artistLogoUrl,
				);
			}

			await this.persistAll();
			for (const { track, streamUrl } of tracks) {
				if (!this.tracks[track.id]?.complete) {
					this.enqueueTrack(track.id, streamUrl);
				}
			}
			this.notify();
		});
	}

	downloadGenre(params: {
		genre: Genre;
		artists?: Array<Artist>;
		tracks: Array<{ track: Track; streamUrl: string; artistLogoUrl: string | null }>;
		resolvedGenres?: Array<Genre>;
	}): void {
		const { artists = [], genre, tracks, resolvedGenres = [] } = params;
		this.ensureLoaded().then(async () => {
			this.preloadDownloadImages({
				albumArtUrls: [genre.imageUrl, ...tracks.map(({ track }) => track.albumImageUrl)],
				artistImageUrls: artists.map((artist) => artist.imageUrl),
				artistLogoUrls: tracks.map(({ artistLogoUrl }) => artistLogoUrl),
				genreArtUrls: [
					genre.imageUrl,
					...resolvedGenres.map((g) => g.imageUrl),
					...tracks.flatMap(({ track }) => (track.genres ?? []).map((g) => g.imageUrl)),
				],
			});

			for (const artist of artists) {
				this.upsertArtistEntry({
					albumIds: [],
					artist,
				});
			}

			const trackArtistLogoUrls: Record<string, string | null> = {};
			for (const { track, artistLogoUrl } of tracks) {
				trackArtistLogoUrls[track.id] = artistLogoUrl;
			}

			this.genres[genre.id] = {
				genre,
				trackArtistLogoUrls,
				trackIds: tracks.map((t) => t.track.id),
			};
			for (const { artistLogoUrl, streamUrl, track } of tracks) {
				this.addTrackRef(
					track,
					streamUrl,
					null,
					genre.id,
					null,
					[...(track.genres ?? []), genre, ...resolvedGenres],
					artistLogoUrl,
				);
			}
			await this.persistAll();

			for (const { track, streamUrl } of tracks) {
				if (!this.tracks[track.id]?.complete) {
					this.enqueueTrack(track.id, streamUrl);
				}
			}
			this.notify();
		});
	}

	downloadArtistAlbums(params: {
		artist: Artist;
		albumEntries: Array<{
			album: Album;
			tracks: Array<{ track: Track; streamUrl: string }>;
		}>;
		artistLogoUrl: string | null;
		resolvedGenres?: Array<Genre>;
	}): void {
		const { artist, albumEntries, artistLogoUrl, resolvedGenres = [] } = params;
		this.ensureLoaded().then(async () => {
			this.preloadDownloadImages({
				albumArtUrls: albumEntries.flatMap(({ album, tracks }) => [
					album.imageUrl,
					...tracks.map(({ track }) => track.albumImageUrl),
				]),
				artistImageUrls: [artist.imageUrl],
				artistLogoUrls: [artistLogoUrl],
				genreArtUrls: [
					...resolvedGenres.map((g) => g.imageUrl),
					...albumEntries.flatMap(({ album, tracks }) => [
						...(album.genres ?? []).map((g) => g.imageUrl),
						...tracks.flatMap(({ track }) => (track.genres ?? []).map((g) => g.imageUrl)),
					]),
				],
			});

			this.upsertArtistEntry({
				albumIds: albumEntries.map((a) => a.album.id),
				artist,
			});
			for (const { album, tracks } of albumEntries) {
				this.albums[album.id] = {
					album,
					artistLogoUrl,
					trackIds: tracks.map((t) => t.track.id),
				};
				for (const { track, streamUrl } of tracks) {
					this.addTrackRef(
						track,
						streamUrl,
						album.id,
						null,
						null,
						[...(album.genres ?? []), ...resolvedGenres],
						artistLogoUrl,
					);
				}
			}
			await this.persistAll();

			for (const { tracks } of albumEntries) {
				for (const { track, streamUrl } of tracks) {
					if (!this.tracks[track.id]?.complete) {
						this.enqueueTrack(track.id, streamUrl);
					}
				}
			}
			this.notify();
		});
	}

	// -------------------------------------------------------------------------
	// Remove actions
	// -------------------------------------------------------------------------

	removeAlbumDownload(albumId: string): void {
		this.ensureLoaded().then(async () => {
			const entry = this.albums[albumId];
			if (!entry) return;
			delete this.albums[albumId];
			this.removeAlbumReferenceFromArtists(albumId);
			for (const trackId of entry.trackIds) {
				await this.dereferenceTrack(trackId, albumId, null, null);
			}
			this.pruneOrphanArtists();
			await this.persistAll();
			this.notify();
		});
	}

	removePlaylistDownload(playlistId: string): void {
		this.ensureLoaded().then(async () => {
			const entry = this.playlists[playlistId];
			if (!entry) return;
			delete this.playlists[playlistId];
			for (const trackId of entry.trackIds) {
				await this.dereferenceTrack(trackId, null, null, playlistId);
			}
			this.pruneOrphanArtists();
			await this.persistAll();
			this.notify();
		});
	}

	removeGenreDownload(genreId: string): void {
		this.ensureLoaded().then(async () => {
			const entry = this.genres[genreId];
			if (!entry) return;
			delete this.genres[genreId];
			for (const trackId of entry.trackIds) {
				await this.dereferenceTrack(trackId, null, genreId, null);
			}
			this.pruneOrphanArtists();
			await this.persistAll();
			this.notify();
		});
	}

	removeArtistDownload(artistId: string): void {
		this.ensureLoaded().then(async () => {
			const artistEntry = this.artists[artistId];
			if (!artistEntry) return;
			delete this.artists[artistId];
			for (const albumId of artistEntry.albumIds) {
				const albumEntry = this.albums[albumId];
				if (!albumEntry) continue;
				delete this.albums[albumId];
				for (const trackId of albumEntry.trackIds) {
					await this.dereferenceTrack(trackId, albumId, null, null);
				}
			}
			this.pruneOrphanArtists();
			await this.persistAll();
			this.notify();
		});
	}

	removeAllDownloads(): void {
		this.ensureLoaded().then(async () => {
			const trackIds = Object.keys(this.tracks);
			if (trackIds.length > 0) {
				if (this.removeTracksFn) {
					await this.removeTracksFn(trackIds);
				} else {
					for (const trackId of trackIds) {
						await this.removeTrackFn(trackId);
					}
				}
			}

			this.albums = {};
			this.genres = {};
			this.playlists = {};
			this.artists = {};
			this.tracks = {};
			this.queue = [];

			await this.persistAll();
			this.notify();
		});
	}

	// -------------------------------------------------------------------------
	// Internal helpers
	// -------------------------------------------------------------------------

	private addTrackRef(
		track: Track,
		streamUrl: string,
		albumId: string | null,
		genreId: string | null,
		playlistId: string | null,
		genreRefs?: Array<Genre>,
		artistLogoUrl?: string | null,
	): void {
		const normalizedGenres: Array<Genre> = this.normalizeGenres([
			...(genreRefs ?? []),
			...(track.genres ?? []),
		]);
		if (genreId) {
			const existingGenre = this.genres[genreId]?.genre;
			normalizedGenres.push(
				existingGenre ?? {
					id: genreId,
					name: this.genres[genreId]?.genre.name ?? genreId,
				},
			);
		}

		const explicitGenreIds: Array<string> = genreId ? [genreId] : [];
		const existing = this.tracks[track.id];
		if (existing) {
			if (albumId && !existing.albumIds.includes(albumId)) {
				existing.albumIds.push(albumId);
			}
			for (const explicitGenreId of explicitGenreIds) {
				if (!existing.genreIds.includes(explicitGenreId)) {
					existing.genreIds.push(explicitGenreId);
				}
			}
			if (playlistId && !existing.playlistIds.includes(playlistId)) {
				existing.playlistIds.push(playlistId);
			}
		} else {
			this.tracks[track.id] = {
				albumIds: albumId ? [albumId] : [],
				complete: false,
				genreIds: explicitGenreIds,
				playlistIds: playlistId ? [playlistId] : [],
				streamUrl,
				track,
			};
		}

		for (const genre of normalizedGenres) {
			this.upsertGenreTrackReference(genre, track.id, artistLogoUrl ?? null);
		}
	}

	private async dereferenceTrack(
		trackId: string,
		albumId: string | null,
		genreId: string | null,
		playlistId: string | null,
	): Promise<void> {
		const entry = this.tracks[trackId];
		if (!entry) return;
		if (albumId) {
			entry.albumIds = entry.albumIds.filter((id) => id !== albumId);
		}
		if (genreId) {
			entry.genreIds = entry.genreIds.filter((id) => id !== genreId);
		}
		if (playlistId) {
			entry.playlistIds = entry.playlistIds.filter((id) => id !== playlistId);
		}

		if (
			entry.albumIds.length === 0 &&
			entry.genreIds.length === 0 &&
			entry.playlistIds.length === 0
		) {
			this.removeTrackFromAllGenres(trackId);
			delete this.tracks[trackId];
			this.queue = this.queue.filter((q) => q.trackId !== trackId);
			await this.removeTrackFn(trackId);
		}
	}

	private normalizeGenres(genres: Array<Genre>): Array<Genre> {
		const byId = new Map<string, Genre>();

		for (const genre of genres) {
			const genreId = genre?.id?.trim();
			const genreName = genre?.name?.trim();
			if (!genreId || !genreName) {
				continue;
			}

			const existing = byId.get(genreId);
			if (!existing) {
				byId.set(genreId, {
					id: genreId,
					imageUrl: genre.imageUrl,
					name: genreName,
					trackCount: genre.trackCount,
				});
				continue;
			}

			byId.set(genreId, {
				...existing,
				imageUrl: existing.imageUrl ?? genre.imageUrl,
				name: existing.name || genreName,
				trackCount: existing.trackCount ?? genre.trackCount,
			});
		}

		return [...byId.values()];
	}

	private upsertGenreTrackReference(
		genre: Genre,
		trackId: string,
		artistLogoUrl: string | null,
	): void {
		const existing = this.genres[genre.id];
		if (!existing) {
			this.genres[genre.id] = {
				genre: { ...genre },
				trackArtistLogoUrls: { [trackId]: artistLogoUrl },
				trackIds: [trackId],
			};
			return;
		}

		existing.genre = {
			...existing.genre,
			imageUrl: existing.genre.imageUrl ?? genre.imageUrl,
			name: existing.genre.name || genre.name,
			trackCount: existing.genre.trackCount ?? genre.trackCount,
		};

		if (!existing.trackIds.includes(trackId)) {
			existing.trackIds.push(trackId);
		}

		const existingLogo = existing.trackArtistLogoUrls[trackId];
		if (existingLogo == null && artistLogoUrl != null) {
			existing.trackArtistLogoUrls[trackId] = artistLogoUrl;
		} else if (!(trackId in existing.trackArtistLogoUrls)) {
			existing.trackArtistLogoUrls[trackId] = artistLogoUrl;
		}
	}

	private removeTrackFromAllGenres(trackId: string): void {
		for (const [genreId, genreEntry] of Object.entries(this.genres)) {
			if (!genreEntry.trackIds.includes(trackId)) {
				continue;
			}

			genreEntry.trackIds = genreEntry.trackIds.filter((id) => id !== trackId);
			delete genreEntry.trackArtistLogoUrls[trackId];

			if (genreEntry.trackIds.length === 0) {
				delete this.genres[genreId];
			}
		}
	}

	private enqueueTrack(trackId: string, streamUrl: string): void {
		if (this.queue.some((q) => q.trackId === trackId)) return;
		this.queue.push({ streamUrl, trackId });
		this.drainQueue();
	}

	private preloadDownloadImages(params: {
		albumArtUrls: Array<string | null | undefined>;
		artistImageUrls: Array<string | null | undefined>;
		artistLogoUrls: Array<string | null | undefined>;
		genreArtUrls: Array<string | null | undefined>;
	}): void {
		if (!this.preloadImagesFn) {
			return;
		}

		this.preloadCategory(params.albumArtUrls, 'album_art');
		this.preloadCategory(params.genreArtUrls, 'genre_art');
		this.preloadCategory(params.artistImageUrls, 'artist_image');
		this.preloadCategory(params.artistLogoUrls, 'artist_logo');
	}

	private upsertArtistEntry(entry: DownloadedArtistEntry): void {
		const existing = this.artists[entry.artist.id];
		if (!existing) {
			this.artists[entry.artist.id] = {
				albumIds: [...entry.albumIds],
				artist: { ...entry.artist },
			};
			return;
		}

		const mergedAlbumIds = Array.from(new Set([...existing.albumIds, ...entry.albumIds]));
		this.artists[entry.artist.id] = {
			albumIds: mergedAlbumIds,
			artist: {
				...existing.artist,
				...entry.artist,
				imageUrl: existing.artist.imageUrl ?? entry.artist.imageUrl,
				logoUrl: existing.artist.logoUrl ?? entry.artist.logoUrl,
				name: existing.artist.name || entry.artist.name,
			},
		};
	}

	private removeAlbumReferenceFromArtists(albumId: string): void {
		for (const artistEntry of Object.values(this.artists)) {
			artistEntry.albumIds = artistEntry.albumIds.filter((id) => id !== albumId);
		}
	}

	private pruneOrphanArtists(): void {
		for (const [artistId, artistEntry] of Object.entries(this.artists)) {
			if (artistEntry.albumIds.length > 0) {
				continue;
			}

			const hasTrackReference = Object.values(this.tracks).some(
				(trackEntry) => trackEntry.track.artistId === artistId,
			);
			if (!hasTrackReference) {
				delete this.artists[artistId];
			}
		}
	}

	private preloadCategory(urls: Array<string | null | undefined>, category: ImageCategory): void {
		if (!this.preloadImagesFn) {
			return;
		}

		const uniqueUrls = Array.from(
			new Set(
				urls
					.map((url) => (typeof url === 'string' ? url.trim() : ''))
					.filter((url): url is string => url.length > 0),
			),
		);

		if (uniqueUrls.length === 0) {
			return;
		}

		try {
			this.preloadImagesFn(uniqueUrls, category);
		} catch {
			// Best effort only.
		}
	}

	private drainQueue(): void {
		while (this.activeCount < MAX_CONCURRENT_DOWNLOADS && this.queue.length > 0) {
			const item = this.queue.shift();
			if (!item) break;
			this.activeCount += 1;
			this.downloadTrack(item).then(() => {
				this.activeCount -= 1;
				this.drainQueue();
			});
		}
	}

	private async downloadTrack(item: { trackId: string; streamUrl: string }): Promise<void> {
		const { trackId, streamUrl } = item;
		if (!this.tracks[trackId]) return;

		try {
			await this.cacheTrackFn(trackId, streamUrl);
			if (!this.tracks[trackId]) return; // removed while downloading

			const entry = this.tracks[trackId];
			if (entry) {
				entry.complete = true;
			}

			await this.persistAll();
			this.notify();
			this.onTrackDownloadedFn?.(trackId);
		} catch {
			// Leave incomplete; will retry on next onAppReady.
		}
	}

	// -------------------------------------------------------------------------
	// Persistence
	// -------------------------------------------------------------------------

	private ensureLoaded(): Promise<void> {
		if (this.isLoaded) return Promise.resolve();
		this.loadChain = this.loadChain.then(async () => {
			if (this.isLoaded) return;
			this.albums = await this.loadKey<Record<string, DownloadedAlbumEntry>>(KEY_ALBUMS, {});
			this.genres = await this.loadKey<Record<string, DownloadedGenreEntry>>(KEY_GENRES, {});
			this.playlists = await this.loadKey<Record<string, DownloadedPlaylistEntry>>(
				KEY_PLAYLISTS,
				{},
			);
			this.artists = await this.loadKey<Record<string, DownloadedArtistEntry>>(KEY_ARTISTS, {});
			this.tracks = await this.loadKey<Record<string, DownloadedTrackEntry>>(KEY_TRACKS, {});
			for (const trackEntry of Object.values(this.tracks)) {
				if (!Array.isArray(trackEntry.genreIds)) {
					trackEntry.genreIds = [];
				}
			}
			this.isLoaded = true;
		});
		return this.loadChain;
	}

	private async loadKey<T>(key: string, fallback: T): Promise<T> {
		try {
			return JSON.parse(await this.store.fetchString(key)) as T;
		} catch {
			return fallback;
		}
	}

	private async persistAll(): Promise<void> {
		await Promise.all([
			this.store.storeString(KEY_ALBUMS, JSON.stringify(this.albums)),
			this.store.storeString(KEY_GENRES, JSON.stringify(this.genres)),
			this.store.storeString(KEY_PLAYLISTS, JSON.stringify(this.playlists)),
			this.store.storeString(KEY_ARTISTS, JSON.stringify(this.artists)),
			this.store.storeString(KEY_TRACKS, JSON.stringify(this.tracks)),
		]);
	}
}
