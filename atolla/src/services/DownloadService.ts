import type { Album } from '../models/Album';
import type { Artist } from '../models/Artist';
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
	/** Hint native image cache to persist image assets for offline experience. */
	preloadImages?: (urls: Array<string>, category: ImageCategory) => void;
	/** Remove a previously downloaded track from permanent storage. */
	removeTrack: (trackId: string) => void;
	store: DownloadServiceStore;
}

// ---------------------------------------------------------------------------
// Internal persistence keys (one key per entity type)
// ---------------------------------------------------------------------------

const KEY_ALBUMS = 'dl_albums';
const KEY_PLAYLISTS = 'dl_playlists';
const KEY_ARTISTS = 'dl_artists';
const KEY_TRACKS = 'dl_tracks';

const MAX_CONCURRENT_DOWNLOADS = 3;

// ---------------------------------------------------------------------------
// DownloadService
// ---------------------------------------------------------------------------

export class DownloadService {
	private albums: Record<string, DownloadedAlbumEntry> = {};
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
	private readonly removeTrackFn: DownloadServiceOptions['removeTrack'];
	private readonly preloadImagesFn: DownloadServiceOptions['preloadImages'];

	constructor(options: DownloadServiceOptions) {
		this.store = options.store;
		this.cacheTrackFn = options.cacheTrack;
		this.getTrackPlaybackUrlFn = options.getTrackPlaybackUrl;
		this.getTotalDownloadedSizeBytesFn = options.getTotalDownloadedSizeBytes;
		this.removeTrackFn = options.removeTrack;
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
	}): void {
		const { album, artistImageUrl, tracks, artistLogoUrl } = params;
		this.ensureLoaded().then(async () => {
			this.preloadDownloadImages({
				albumArtUrls: [album.imageUrl, ...tracks.map(({ track }) => track.albumImageUrl)],
				artistImageUrls: [artistImageUrl],
				artistLogoUrls: [artistLogoUrl],
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
				this.addTrackRef(track, streamUrl, album.id, null);
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
	}): void {
		const { artists = [], playlist, tracks } = params;
		this.ensureLoaded().then(async () => {
			this.preloadDownloadImages({
				albumArtUrls: [playlist.imageUrl, ...tracks.map(({ track }) => track.albumImageUrl)],
				artistImageUrls: artists.map((artist) => artist.imageUrl),
				artistLogoUrls: tracks.map(({ artistLogoUrl }) => artistLogoUrl),
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
			for (const { track, streamUrl } of tracks) {
				this.addTrackRef(track, streamUrl, null, playlist.id);
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
	}): void {
		const { artist, albumEntries, artistLogoUrl } = params;
		this.ensureLoaded().then(async () => {
			this.preloadDownloadImages({
				albumArtUrls: albumEntries.flatMap(({ album, tracks }) => [
					album.imageUrl,
					...tracks.map(({ track }) => track.albumImageUrl),
				]),
				artistImageUrls: [artist.imageUrl],
				artistLogoUrls: [artistLogoUrl],
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
					this.addTrackRef(track, streamUrl, album.id, null);
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
				this.dereferenceTrack(trackId, albumId, null);
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
				this.dereferenceTrack(trackId, null, playlistId);
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
					this.dereferenceTrack(trackId, albumId, null);
				}
			}
			this.pruneOrphanArtists();
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
		playlistId: string | null,
	): void {
		const existing = this.tracks[track.id];
		if (existing) {
			if (albumId && !existing.albumIds.includes(albumId)) {
				existing.albumIds.push(albumId);
			}
			if (playlistId && !existing.playlistIds.includes(playlistId)) {
				existing.playlistIds.push(playlistId);
			}
		} else {
			this.tracks[track.id] = {
				albumIds: albumId ? [albumId] : [],
				complete: false,
				playlistIds: playlistId ? [playlistId] : [],
				streamUrl,
				track,
			};
		}
	}

	private dereferenceTrack(
		trackId: string,
		albumId: string | null,
		playlistId: string | null,
	): void {
		const entry = this.tracks[trackId];
		if (!entry) return;

		if (albumId) {
			entry.albumIds = entry.albumIds.filter((id) => id !== albumId);
		}
		if (playlistId) {
			entry.playlistIds = entry.playlistIds.filter((id) => id !== playlistId);
		}

		if (entry.albumIds.length === 0 && entry.playlistIds.length === 0) {
			delete this.tracks[trackId];
			this.queue = this.queue.filter((q) => q.trackId !== trackId);
			this.removeTrackFn(trackId);
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
	}): void {
		if (!this.preloadImagesFn) {
			return;
		}

		this.preloadCategory(params.albumArtUrls, 'album_art');
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
			this.playlists = await this.loadKey<Record<string, DownloadedPlaylistEntry>>(
				KEY_PLAYLISTS,
				{},
			);
			this.artists = await this.loadKey<Record<string, DownloadedArtistEntry>>(KEY_ARTISTS, {});
			this.tracks = await this.loadKey<Record<string, DownloadedTrackEntry>>(KEY_TRACKS, {});
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
			this.store.storeString(KEY_PLAYLISTS, JSON.stringify(this.playlists)),
			this.store.storeString(KEY_ARTISTS, JSON.stringify(this.artists)),
			this.store.storeString(KEY_TRACKS, JSON.stringify(this.tracks)),
		]);
	}
}
