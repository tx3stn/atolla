import type { Album } from '../models/Album';
import type { Artist } from '../models/Artist';
import type { Genre } from '../models/Genre';
import type { Playlist } from '../models/Playlist';
import type { Track } from '../models/Track';
import type { ImageCategory } from './ImageCache';
import { imageCacheKey } from './ImageSource';

export type DownloadState = 'not_downloaded' | 'downloading' | 'downloaded';

export interface DownloadedTrackEntry {
	albumIds: Array<string>;
	complete: boolean;
	genreIds: Array<string>;
	playlistIds: Array<string>;
	requiredImageKeys: Array<string>;
	streamUrl: string;
	track: Track;
}

interface ImageReq {
	category: ImageCategory;
	url: string | null | undefined;
}

export interface DownloadedImageEntry {
	attempts: number;
	category: ImageCategory;
	complete: boolean;
	// exhausted retries count as done so the item can still complete
	exhausted: boolean;
	url: string;
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

export interface DownloadServiceStore {
	fetchString(key: string): Promise<string>;
	storeString(key: string, value: string): Promise<void>;
}

export interface DownloadServiceOptions {
	// when omitted, image tracking is disabled and downloads complete on audio alone.
	// resolves once cached (already present or freshly fetched), rejects on failure
	cacheImage?: (url: string, category: ImageCategory) => Promise<void>;
	cacheTrack: (trackId: string, url: string) => Promise<void>;
	getTotalDownloadedSizeBytes?: () => number;
	getTrackPlaybackUrl: (trackId: string) => string;
	onTrackDownloaded?: (trackId: string) => void;
	removeTrack: (trackId: string) => Promise<void> | void;
	removeTracks?: (trackIds: Array<string>) => Promise<void> | void;
	store: DownloadServiceStore;
}

const KEY_ALBUMS = 'dl_albums';
const KEY_GENRES = 'dl_genres';
const KEY_PLAYLISTS = 'dl_playlists';
const KEY_ARTISTS = 'dl_artists';
const KEY_TRACKS = 'dl_tracks';
const KEY_IMAGES = 'dl_images';

const MAX_CONCURRENT_DOWNLOADS = 3;
// images are cheap (often already cached), so allow more in flight than tracks
const MAX_CONCURRENT_IMAGE_DOWNLOADS = 8;
const IMAGE_MAX_ATTEMPTS = 3;

export class DownloadService {
	private albums: Record<string, DownloadedAlbumEntry> = {};
	private genres: Record<string, DownloadedGenreEntry> = {};
	private playlists: Record<string, DownloadedPlaylistEntry> = {};
	private artists: Record<string, DownloadedArtistEntry> = {};
	private tracks: Record<string, DownloadedTrackEntry> = {};
	private images: Record<string, DownloadedImageEntry> = {};

	private isLoaded = false;
	private loadChain: Promise<void> = Promise.resolve();

	private queue: Array<{ trackId: string; streamUrl: string }> = [];
	private activeCount = 0;
	private imageQueue: Array<string> = [];
	private activeImageCount = 0;
	private readonly activeImageKeys = new Set<string>();
	private operationChain: Promise<void> = Promise.resolve();

	private readonly subscribers = new Set<() => void>();
	private readonly store: DownloadServiceStore;
	private readonly cacheTrackFn: DownloadServiceOptions['cacheTrack'];
	private readonly cacheImageFn: DownloadServiceOptions['cacheImage'];
	private readonly getTrackPlaybackUrlFn: DownloadServiceOptions['getTrackPlaybackUrl'];
	private readonly getTotalDownloadedSizeBytesFn: DownloadServiceOptions['getTotalDownloadedSizeBytes'];
	private readonly onTrackDownloadedFn: DownloadServiceOptions['onTrackDownloaded'];
	private readonly removeTrackFn: DownloadServiceOptions['removeTrack'];
	private readonly removeTracksFn: DownloadServiceOptions['removeTracks'];

	constructor(options: DownloadServiceOptions) {
		this.store = options.store;
		this.cacheTrackFn = options.cacheTrack;
		this.cacheImageFn = options.cacheImage;
		this.getTrackPlaybackUrlFn = options.getTrackPlaybackUrl;
		this.getTotalDownloadedSizeBytesFn = options.getTotalDownloadedSizeBytes;
		this.onTrackDownloadedFn = options.onTrackDownloaded;
		this.removeTrackFn = options.removeTrack;
		this.removeTracksFn = options.removeTracks;
	}

	private enqueueOperation(operation: () => Promise<void>): void {
		this.operationChain = this.operationChain.then(operation, operation);
	}

	private enqueueRemoval(label: string, remove: () => Promise<boolean>): void {
		this.enqueueOperation(async () => {
			try {
				await this.ensureLoaded();
				if (!(await remove())) {
					return;
				}
				this.pruneOrphanArtists();
				await this.persistAll();
				this.notify();
			} catch (err) {
				console.warn(`[downloads] failed to remove ${label}`, err);
			}
		});
	}

	private async removeEntry(
		collection: Record<string, { trackIds: Array<string> }>,
		id: string,
		reference: { albumId?: string; genreId?: string; playlistId?: string },
		onRemoved?: () => void,
	): Promise<boolean> {
		const entry = collection[id];
		if (!entry) return false;

		delete collection[id];
		onRemoved?.();

		for (const trackId of entry.trackIds) {
			await this.dereferenceTrack(
				trackId,
				reference.albumId ?? null,
				reference.genreId ?? null,
				reference.playlistId ?? null,
			);
		}
		return true;
	}

	onAppReady(): void {
		this.enqueueOperation(async () => {
			try {
				await this.ensureLoaded();
				// re-enqueue tracks that didn't finish downloading
				for (const entry of Object.values(this.tracks)) {
					if (!entry.complete) {
						this.enqueueTrack(entry.track.id, entry.streamUrl);
					}
				}
				// retry images not yet cached that still have retries left
				for (const [key, image] of Object.entries(this.images)) {
					if (!image.complete && !image.exhausted) {
						this.enqueueImage(key);
					}
				}
				this.notify();
			} catch (err) {
				console.warn('[downloads] failed to load on app ready', err);
			}
		});
	}

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
		// an artist with no tracked albums (e.g. registered via a playlist/genre) isn't
		// downloaded; guard against [].every() reporting it as fully downloaded
		if (entry.albumIds.length === 0) return 'not_downloaded';
		const albumStates = entry.albumIds.map((id) => this.getAlbumDownloadState(id));
		if (albumStates.every((s) => s === 'downloaded')) return 'downloaded';
		if (albumStates.some((s) => s !== 'not_downloaded')) return 'downloading';
		return 'not_downloaded';
	}

	getDownloadingCount(): number {
		return Object.values(this.tracks).filter((t) => !t.complete).length;
	}

	getDownloadedTrackCount(): number {
		return Object.values(this.tracks).filter((t) => t.complete).length;
	}

	getTotalDownloadedSizeBytes(): number | null {
		return this.getTotalDownloadedSizeBytesFn?.() ?? null;
	}

	isTrackDownloaded(trackId: string): boolean {
		return this.tracks[trackId]?.complete === true;
	}

	getTrackPlaybackUrl(trackId: string): string {
		return this.getTrackPlaybackUrlFn(trackId);
	}

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

	downloadAlbum(params: {
		album: Album;
		tracks: Array<{ track: Track; streamUrl: string }>;
		artistImageUrl?: string | null;
		artistLogoUrl: string | null;
		resolvedGenres?: Array<Genre>;
	}): void {
		const { album, artistImageUrl, tracks, artistLogoUrl, resolvedGenres = [] } = params;
		this.enqueueOperation(async () => {
			await this.ensureLoaded();

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
			// album-level genres apply to every track; track-level genres stay per-track.
			// resolvedGenres (the union) only supplies resolved image urls
			const enrichGenres = this.genreEnricher(resolvedGenres);
			const albumGenres = enrichGenres(album.genres ?? []);
			for (const { track, streamUrl } of tracks) {
				const normalized = this.normalizeTrackArtist(track, album);
				const trackGenres = [...albumGenres, ...enrichGenres(track.genres ?? [])];
				this.addTrackRef(normalized, streamUrl, album.id, null, null, trackGenres, artistLogoUrl);
				this.addTrackImageRequirements(normalized.id, [
					...this.albumArtReqs(track.albumImageUrl),
					...this.albumArtReqs(album.imageUrl),
					...this.artistReqs(artistImageUrl, artistLogoUrl),
					...this.genreArtReqs(trackGenres),
				]);
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
		this.enqueueOperation(async () => {
			await this.ensureLoaded();

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
			// every track in the playlist needs the playlist cover and all of the
			// playlist's artist images for offline browsing, so attach them to each
			const sharedReqs = [
				...this.playlistImageReqs(playlist.imageUrl),
				...artists.flatMap((artist) => this.artistReqs(artist.imageUrl, null)),
			];
			// resolvedGenres is the union of every track's genres (with image urls
			// resolved); use it only to enrich each track's own genres, never to assign
			// the whole playlist's genres to every track
			const enrichGenres = this.genreEnricher(resolvedGenres);
			for (const { artistLogoUrl, streamUrl, track } of tracks) {
				const trackGenres = enrichGenres(track.genres ?? []);
				this.addTrackRef(track, streamUrl, null, null, playlist.id, trackGenres, artistLogoUrl);
				this.addTrackImageRequirements(track.id, [
					...this.albumArtReqs(track.albumImageUrl),
					...this.artistReqs(null, artistLogoUrl),
					...this.genreArtReqs(trackGenres),
					...sharedReqs,
				]);
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
		this.enqueueOperation(async () => {
			await this.ensureLoaded();

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
			// the genre artwork and all of the genre's artist images are required for
			// every track so the genre page renders offline
			const sharedReqs = [
				...this.genreArtReqs([genre]),
				...artists.flatMap((artist) => this.artistReqs(artist.imageUrl, null)),
			];
			// each track belongs to the genre being downloaded plus its own genres; the
			// resolvedGenres union only enriches a track's own genres with image urls
			const enrichGenres = this.genreEnricher(resolvedGenres);
			for (const { artistLogoUrl, streamUrl, track } of tracks) {
				const trackGenres = [genre, ...enrichGenres(track.genres ?? [])];
				this.addTrackRef(track, streamUrl, null, genre.id, null, trackGenres, artistLogoUrl);
				this.addTrackImageRequirements(track.id, [
					...this.albumArtReqs(track.albumImageUrl),
					...this.artistReqs(null, artistLogoUrl),
					...this.genreArtReqs(trackGenres),
					...sharedReqs,
				]);
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
		this.enqueueOperation(async () => {
			await this.ensureLoaded();

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
				const albumGenres = [...(album.genres ?? []), ...resolvedGenres];
				for (const { track, streamUrl } of tracks) {
					const normalized = this.normalizeTrackArtist(track, album);
					this.addTrackRef(normalized, streamUrl, album.id, null, null, albumGenres, artistLogoUrl);
					this.addTrackImageRequirements(normalized.id, [
						...this.albumArtReqs(track.albumImageUrl),
						...this.albumArtReqs(album.imageUrl),
						...this.artistReqs(artist.imageUrl, artistLogoUrl),
						...this.genreArtReqs([...albumGenres, ...(track.genres ?? [])]),
					]);
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

	removeAlbumDownload(albumId: string): void {
		this.enqueueRemoval('album download', () =>
			this.removeEntry(this.albums, albumId, { albumId }, () =>
				this.removeAlbumReferenceFromArtists(albumId),
			),
		);
	}

	registerSyncedPlaylist(playlist: Playlist, trackIds: ReadonlyArray<string>): void {
		this.enqueueOperation(async () => {
			await this.ensureLoaded();
			const knownTrackIds = trackIds.filter((id) => id !== '' && this.tracks[id] !== undefined);
			this.playlists[playlist.id] = {
				playlist,
				trackArtistLogoUrls: {},
				trackIds: knownTrackIds,
			};
			const imageReqs = this.playlistImageReqs(playlist.imageUrl);
			for (const trackId of knownTrackIds) {
				this.addTrackImageRequirements(trackId, imageReqs);
			}
			await this.persistAll();
			this.notify();
		});
	}

	removePlaylistDownload(playlistId: string): void {
		this.enqueueRemoval('playlist download', () =>
			this.removeEntry(this.playlists, playlistId, { playlistId }),
		);
	}

	removeGenreDownload(genreId: string): void {
		this.enqueueRemoval('genre download', () =>
			this.removeEntry(this.genres, genreId, { genreId }),
		);
	}

	removeArtistDownload(artistId: string): void {
		this.enqueueRemoval('artist download', async () => {
			const artistEntry = this.artists[artistId];
			if (!artistEntry) return false;
			delete this.artists[artistId];
			for (const albumId of artistEntry.albumIds) {
				await this.removeEntry(this.albums, albumId, { albumId });
			}
			return true;
		});
	}

	removeAllDownloads(): void {
		this.enqueueRemoval('all downloads', async () => {
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
			this.images = {};
			this.queue = [];
			this.imageQueue = [];

			return true;
		});
	}

	private normalizeTrackArtist(track: Track, album: Album): Track {
		if (!album.artistId || track.artistId === album.artistId) return track;
		return { ...track, artistId: album.artistId, artistName: album.artistName };
	}

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
				// propagate the normalized artistId to the stored track. the caller
				// normalizes album tracks via normalizeTrackArtist, so if the stored
				// entry was created earlier (e.g. from a playlist) with a mismatched
				// track-level artistId, this brings it in line with the album's artist
				if (track.artistId && existing.track.artistId !== track.artistId) {
					existing.track = {
						...existing.track,
						artistId: track.artistId,
						artistName: track.artistName,
					};
				}
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
				requiredImageKeys: [],
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
			this.pruneOrphanImages();
			await this.removeTrackFn(trackId);
		}
	}

	// builds a function that enriches a track's own genres with resolved image urls
	// (and other fields) from the resolution pool, keyed by id. the track's genre
	// membership is preserved exactly; no genres are added or removed
	private genreEnricher(resolved: Array<Genre>): (genres: Array<Genre>) => Array<Genre> {
		const byId = new Map(resolved.map((g) => [g.id, g]));
		return (genres) =>
			genres.map((g) => ({
				...byId.get(g.id),
				...g,
				imageUrl: g.imageUrl ?? byId.get(g.id)?.imageUrl,
			}));
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

	private albumArtReqs(url: string | null | undefined): Array<ImageReq> {
		// full `album_art` is required: the on-device blurred backdrop is generated
		// from the cached original, so it must never be missing offline
		return [
			{ category: 'album_art', url },
			{ category: 'album_art_thumb', url },
		];
	}

	private artistReqs(
		imageUrl: string | null | undefined,
		logoUrl: string | null | undefined,
	): Array<ImageReq> {
		return [
			{ category: 'artist_image', url: imageUrl },
			{ category: 'artist_image_thumb', url: imageUrl },
			{ category: 'artist_logo', url: logoUrl },
		];
	}

	private playlistImageReqs(url: string | null | undefined): Array<ImageReq> {
		return [
			{ category: 'playlist_image', url },
			{ category: 'playlist_image_thumb', url },
		];
	}

	private genreArtReqs(genres: Array<Genre>): Array<ImageReq> {
		return genres.map((genre) => ({ category: 'genre_art', url: genre.imageUrl }));
	}

	// register the images a track needs to display fully offline, dedup them
	// into the tracked image set, and enqueue any that still need caching. no-op
	// when no image cache bridge is available (e.g. platforms without one)
	private addTrackImageRequirements(trackId: string, reqs: Array<ImageReq>): void {
		if (!this.cacheImageFn) {
			return;
		}
		const entry = this.tracks[trackId];
		if (!entry) return;

		for (const { category, url } of reqs) {
			const trimmed = typeof url === 'string' ? url.trim() : '';
			if (trimmed.length === 0) continue;

			const key = imageCacheKey(trimmed, category);
			if (!this.images[key]) {
				this.images[key] = {
					attempts: 0,
					category,
					complete: false,
					exhausted: false,
					url: trimmed,
				};
			}
			if (!entry.requiredImageKeys.includes(key)) {
				entry.requiredImageKeys.push(key);
			}
			const image = this.images[key];
			if (!image.complete && !image.exhausted) {
				this.enqueueImage(key);
			}
		}
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

	private enqueueImage(key: string): void {
		if (this.imageQueue.includes(key) || this.activeImageKeys.has(key)) return;
		const image = this.images[key];
		if (!image || image.complete || image.exhausted) return;
		this.imageQueue.push(key);
		this.drainImageQueue();
	}

	private drainImageQueue(): void {
		while (this.activeImageCount < MAX_CONCURRENT_IMAGE_DOWNLOADS && this.imageQueue.length > 0) {
			const key = this.imageQueue.shift();
			if (key == null) break;
			const image = this.images[key];
			if (!image || image.complete || image.exhausted || this.activeImageKeys.has(key)) continue;
			this.activeImageCount += 1;
			this.activeImageKeys.add(key);
			this.processImage(key).then(() => {
				this.activeImageCount -= 1;
				this.activeImageKeys.delete(key);
				// re-queue here (not from the catch) so a key is never in the queue
				// while still in flight
				const image = this.images[key];
				if (image && !image.complete && !image.exhausted) {
					this.enqueueImage(key);
				}
				this.drainImageQueue();
			});
		}
	}

	private async processImage(key: string): Promise<void> {
		const image = this.images[key];
		if (!image || image.complete || image.exhausted) return;

		try {
			if (!this.cacheImageFn) {
				// no image cache bridge, treat as best-effort done so nothing wedges
				await this.markImageExhausted(key);
				return;
			}
			// the native cache only fetches when missing and reports cached either way,
			// so this resolves promptly for already-cached assets too
			await this.cacheImageFn(image.url, image.category);
			await this.markImageDone(key);
		} catch {
			const current = this.images[key];
			if (!current) return;
			current.attempts += 1;
			if (current.attempts >= IMAGE_MAX_ATTEMPTS) {
				current.exhausted = true;
			}
			// otherwise the drain loop re-queues this key once it leaves the in-flight set
			await this.persistAll();
			this.notify();
		}
	}

	private async markImageDone(key: string): Promise<void> {
		const image = this.images[key];
		if (!image) return;
		image.complete = true;
		await this.persistAll();
		this.notify();
	}

	private async markImageExhausted(key: string): Promise<void> {
		const image = this.images[key];
		if (!image) return;
		image.exhausted = true;
		await this.persistAll();
		this.notify();
	}

	private pruneOrphanImages(): void {
		const referenced = new Set<string>();
		for (const trackEntry of Object.values(this.tracks)) {
			for (const key of trackEntry.requiredImageKeys ?? []) {
				referenced.add(key);
			}
		}
		for (const key of Object.keys(this.images)) {
			if (!referenced.has(key)) {
				delete this.images[key];
			}
		}
		this.imageQueue = this.imageQueue.filter((key) => referenced.has(key));
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
			// leave incomplete; will retry on next onAppReady
		}
	}

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
			this.images = await this.loadKey<Record<string, DownloadedImageEntry>>(KEY_IMAGES, {});
			for (const trackEntry of Object.values(this.tracks)) {
				if (!Array.isArray(trackEntry.genreIds)) {
					trackEntry.genreIds = [];
				}
				if (!Array.isArray(trackEntry.requiredImageKeys)) {
					trackEntry.requiredImageKeys = [];
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
			this.store.storeString(KEY_IMAGES, JSON.stringify(this.images)),
		]);
	}
}
