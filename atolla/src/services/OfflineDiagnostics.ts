import type {
	DownloadedAlbumEntry,
	DownloadedArtistEntry,
	DownloadedGenreEntry,
	DownloadedPlaylistEntry,
	DownloadedTrackEntry,
} from './DownloadService';

// A faithful snapshot of the persisted offline data the render thread consumes,
// built for off-device investigation of offline crashes. It must NEVER throw and
// must make missing data + secrets visible:
//  - missing fields are rendered as explicit markers (JSON.stringify drops
//    `undefined`, so an absent field would otherwise vanish);
//  - URL fields are redacted (Jellyfin image/stream URLs embed `api_key`).

const SCHEMA = 'atolla-offline-status/1';
const SAMPLE_CAP = 10;

const MISSING_MARKER = '<undefined>';
const NULL_MARKER = '<null>';
const EMPTY_MARKER = '<empty>';
const REDACTED_MARKER = '<redacted>';

const SENSITIVE_PARAM =
	/^(api_?key|access_?token|token|x[-_]?emby[-_]?token|password|pwd|auth|secret)$/i;

type FieldValue = string | number | boolean;

/** Structural slice of DownloadService — keeps the builder unit-testable. */
export interface OfflineDownloadsSnapshot {
	getAllAlbums(): Array<DownloadedAlbumEntry>;
	getAllArtists(): Array<DownloadedArtistEntry>;
	getAllGenres(): Array<DownloadedGenreEntry>;
	getAllPlaylists(): Array<DownloadedPlaylistEntry>;
	getAllTracks(): Array<DownloadedTrackEntry>;
	getDownloadedTrackCount(): number;
	getDownloadingCount(): number;
}

export interface OfflineDiagnosticsDeps {
	appVersion?: string;
	connectionMode: string;
	debugLoggingEnabled: boolean;
	downloads: OfflineDownloadsSnapshot;
	generatedAt: string;
	pending?: {
		playlistCreates?: number;
		playlistEdits?: number;
		scrobbles?: number;
	};
	platform: string;
	rawPersisted?: {
		homeAlbums?: string;
		homeRecentlyAdded?: string;
		nowPlayingQueue?: string;
		recentlyPlayed?: string;
	};
	settings?: {
		gridColumns?: number;
		imageCacheMaxBytes?: number;
		trackCacheMaxTracks?: number;
	};
	totalDownloadedSizeBytes?: number | null;
}

export interface CollectionIntegrity {
	duplicateIds: Array<string>;
	missingId: number;
	missingName: number;
	total: number;
}

export interface DanglingRef {
	id: string;
	missing: Array<string>;
}

export interface BlobSummary {
	bytes: number;
	count?: number;
	kind: string;
	note?: string;
	parseOk: boolean;
	present: boolean;
}

export interface OfflineDiagnosticsReport {
	counts: {
		albums: number;
		artists: number;
		downloadedTrackCount: number;
		downloadingCount: number;
		genres: number;
		playlists: number;
		totalDownloadedSizeBytes: FieldValue;
		tracks: { complete: number; incomplete: number; total: number };
	};
	integrity: {
		albums: CollectionIntegrity;
		artists: CollectionIntegrity;
		danglingRefs: {
			albumTrackIds: Array<DanglingRef>;
			artistAlbumIds: Array<DanglingRef>;
			genreTrackIds: Array<DanglingRef>;
			playlistTrackIds: Array<DanglingRef>;
		};
		genres: CollectionIntegrity;
		playlists: CollectionIntegrity;
		tracks: CollectionIntegrity;
	};
	meta: {
		appVersion: FieldValue;
		connectionMode: string;
		debugLoggingEnabled: boolean;
		generatedAt: string;
		platform: string;
		schema: string;
		settings: {
			gridColumns: FieldValue;
			imageCacheMaxBytes: FieldValue;
			trackCacheMaxTracks: FieldValue;
		};
	};
	pending: {
		playlistCreates: FieldValue;
		playlistEdits: FieldValue;
		scrobbles: FieldValue;
	};
	persisted: {
		homeAlbums: BlobSummary;
		homeRecentlyAdded: BlobSummary;
		nowPlayingQueue: BlobSummary;
		recentlyPlayed: BlobSummary;
	};
	samples: {
		albums: Array<Record<string, FieldValue>>;
		artists: Array<Record<string, FieldValue>>;
		genres: Array<Record<string, FieldValue>>;
		playlists: Array<Record<string, FieldValue>>;
		tracks: Array<Record<string, FieldValue>>;
	};
}

function isBlank(value: unknown): boolean {
	return value === undefined || value === null || value === '';
}

function present(value: unknown): FieldValue {
	if (value === undefined) return MISSING_MARKER;
	if (value === null) return NULL_MARKER;
	if (value === '') return EMPTY_MARKER;
	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
		return value;
	}
	return String(value);
}

/** Strips sensitive query params (api_key/token/etc.) while keeping the rest. */
export function redactUrl(value: unknown): FieldValue {
	if (typeof value !== 'string') return present(value);
	if (value === '') return EMPTY_MARKER;
	const queryStart = value.indexOf('?');
	if (queryStart < 0) return value;

	const base = value.slice(0, queryStart);
	const redactedQuery = value
		.slice(queryStart + 1)
		.split('&')
		.map((pair) => {
			const eq = pair.indexOf('=');
			const key = eq < 0 ? pair : pair.slice(0, eq);
			return SENSITIVE_PARAM.test(key) ? `${key}=${REDACTED_MARKER}` : pair;
		})
		.join('&');
	return `${base}?${redactedQuery}`;
}

function refCount(value: unknown): FieldValue {
	return Array.isArray(value) ? value.length : present(value);
}

function integrityOf(items: Array<{ id?: unknown; name?: unknown }>): CollectionIntegrity {
	let missingId = 0;
	let missingName = 0;
	const seen = new Set<string>();
	const duplicates = new Set<string>();

	for (const item of items) {
		if (isBlank(item.id)) {
			missingId += 1;
		} else {
			const id = String(item.id);
			if (seen.has(id)) {
				duplicates.add(id);
			} else {
				seen.add(id);
			}
		}
		if (isBlank(item.name)) {
			missingName += 1;
		}
	}

	return {
		duplicateIds: [...duplicates],
		missingId,
		missingName,
		total: items.length,
	};
}

function danglingRefsFor(
	entries: Array<{ id: unknown; refs: unknown }>,
	known: Set<string>,
): Array<DanglingRef> {
	const result: Array<DanglingRef> = [];
	for (const entry of entries) {
		if (!Array.isArray(entry.refs)) {
			continue;
		}
		const missing = entry.refs.filter(
			(ref): ref is string => typeof ref === 'string' && !known.has(ref),
		);
		if (missing.length > 0) {
			result.push({
				id: isBlank(entry.id) ? String(present(entry.id)) : String(entry.id),
				missing,
			});
		}
	}
	return result;
}

function idSet(ids: Array<unknown>): Set<string> {
	const set = new Set<string>();
	for (const id of ids) {
		if (!isBlank(id)) {
			set.add(String(id));
		}
	}
	return set;
}

function pickSamples<T>(items: Array<T>, isFlagged: (item: T) => boolean): Array<T> {
	const head = items.slice(0, SAMPLE_CAP);
	const flaggedTail = items.slice(SAMPLE_CAP).filter(isFlagged);
	return [...head, ...flaggedTail];
}

function summarizeBlob(raw: string | undefined): BlobSummary {
	if (raw === undefined) {
		return { bytes: 0, kind: 'absent', parseOk: false, present: false };
	}
	if (raw === '') {
		return { bytes: 0, kind: 'absent', note: 'empty string', parseOk: false, present: true };
	}

	const bytes = raw.length;
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (Array.isArray(parsed)) {
			return { bytes, count: parsed.length, kind: 'array', parseOk: true, present: true };
		}
		if (parsed === null) {
			return { bytes, kind: 'null', parseOk: true, present: true };
		}
		if (typeof parsed === 'object') {
			const obj = parsed as Record<string, unknown>;
			const nested = Array.isArray(obj.tracks)
				? obj.tracks
				: Array.isArray(obj.albums)
					? obj.albums
					: undefined;
			return {
				bytes,
				count: nested?.length,
				kind: 'object',
				note: nested ? undefined : `keys: ${Object.keys(obj).slice(0, 20).join(',')}`,
				parseOk: true,
				present: true,
			};
		}
		return { bytes, kind: typeof parsed, parseOk: true, present: true };
	} catch {
		return { bytes, kind: 'invalid', parseOk: false, present: true };
	}
}

export function buildOfflineDiagnosticsReport(
	deps: OfflineDiagnosticsDeps,
): OfflineDiagnosticsReport {
	const albums = safeArray(() => deps.downloads.getAllAlbums());
	const tracks = safeArray(() => deps.downloads.getAllTracks());
	const artists = safeArray(() => deps.downloads.getAllArtists());
	const playlists = safeArray(() => deps.downloads.getAllPlaylists());
	const genres = safeArray(() => deps.downloads.getAllGenres());

	const completeTracks = tracks.filter((entry) => entry.complete === true).length;

	const trackIds = idSet(tracks.map((entry) => entry.track?.id));
	const albumIds = idSet(albums.map((entry) => entry.album?.id));

	const rawPersisted = deps.rawPersisted ?? {};
	const settings = deps.settings ?? {};
	const pending = deps.pending ?? {};

	return {
		counts: {
			albums: albums.length,
			artists: artists.length,
			downloadedTrackCount: safeNumber(() => deps.downloads.getDownloadedTrackCount()),
			downloadingCount: safeNumber(() => deps.downloads.getDownloadingCount()),
			genres: genres.length,
			playlists: playlists.length,
			totalDownloadedSizeBytes: present(deps.totalDownloadedSizeBytes),
			tracks: {
				complete: completeTracks,
				incomplete: tracks.length - completeTracks,
				total: tracks.length,
			},
		},
		integrity: {
			albums: integrityOf(albums.map((entry) => entry.album ?? {})),
			artists: integrityOf(artists.map((entry) => entry.artist ?? {})),
			danglingRefs: {
				albumTrackIds: danglingRefsFor(
					albums.map((entry) => ({ id: entry.album?.id, refs: entry.trackIds })),
					trackIds,
				),
				artistAlbumIds: danglingRefsFor(
					artists.map((entry) => ({ id: entry.artist?.id, refs: entry.albumIds })),
					albumIds,
				),
				genreTrackIds: danglingRefsFor(
					genres.map((entry) => ({ id: entry.genre?.id, refs: entry.trackIds })),
					trackIds,
				),
				playlistTrackIds: danglingRefsFor(
					playlists.map((entry) => ({ id: entry.playlist?.id, refs: entry.trackIds })),
					trackIds,
				),
			},
			genres: integrityOf(genres.map((entry) => entry.genre ?? {})),
			playlists: integrityOf(playlists.map((entry) => entry.playlist ?? {})),
			tracks: integrityOf(tracks.map((entry) => entry.track ?? {})),
		},
		meta: {
			appVersion: present(deps.appVersion),
			connectionMode: deps.connectionMode,
			debugLoggingEnabled: deps.debugLoggingEnabled,
			generatedAt: deps.generatedAt,
			platform: deps.platform,
			schema: SCHEMA,
			settings: {
				gridColumns: present(settings.gridColumns),
				imageCacheMaxBytes: present(settings.imageCacheMaxBytes),
				trackCacheMaxTracks: present(settings.trackCacheMaxTracks),
			},
		},
		pending: {
			playlistCreates: present(pending.playlistCreates),
			playlistEdits: present(pending.playlistEdits),
			scrobbles: present(pending.scrobbles),
		},
		persisted: {
			homeAlbums: summarizeBlob(rawPersisted.homeAlbums),
			homeRecentlyAdded: summarizeBlob(rawPersisted.homeRecentlyAdded),
			nowPlayingQueue: summarizeBlob(rawPersisted.nowPlayingQueue),
			recentlyPlayed: summarizeBlob(rawPersisted.recentlyPlayed),
		},
		samples: {
			albums: pickSamples(
				albums,
				(entry) => isBlank(entry.album?.id) || isBlank(entry.album?.name),
			).map((entry) => albumSample(entry)),
			artists: pickSamples(
				artists,
				(entry) => isBlank(entry.artist?.id) || isBlank(entry.artist?.name),
			).map((entry) => artistSample(entry)),
			genres: pickSamples(
				genres,
				(entry) => isBlank(entry.genre?.id) || isBlank(entry.genre?.name),
			).map((entry) => genreSample(entry)),
			playlists: pickSamples(
				playlists,
				(entry) => isBlank(entry.playlist?.id) || isBlank(entry.playlist?.name),
			).map((entry) => playlistSample(entry)),
			tracks: pickSamples(
				tracks,
				(entry) => isBlank(entry.track?.id) || isBlank(entry.track?.name),
			).map((entry) => trackSample(entry)),
		},
	};
}

function albumSample(entry: DownloadedAlbumEntry): Record<string, FieldValue> {
	const album = entry.album ?? ({} as DownloadedAlbumEntry['album']);
	return {
		artistId: present(album?.artistId),
		artistLogoUrl: redactUrl(entry.artistLogoUrl),
		artistName: present(album?.artistName),
		id: present(album?.id),
		imageUrl: redactUrl(album?.imageUrl),
		name: present(album?.name),
		releaseDate: present(album?.releaseDate),
		trackIdCount: refCount(entry.trackIds),
	};
}

function trackSample(entry: DownloadedTrackEntry): Record<string, FieldValue> {
	const track = entry.track ?? ({} as DownloadedTrackEntry['track']);
	return {
		albumId: present(track?.albumId),
		albumImageUrl: redactUrl(track?.albumImageUrl),
		artistId: present(track?.artistId),
		artistName: present(track?.artistName),
		complete: present(entry.complete),
		duration: present(track?.duration),
		id: present(track?.id),
		name: present(track?.name),
		streamUrl: redactUrl(entry.streamUrl),
	};
}

function artistSample(entry: DownloadedArtistEntry): Record<string, FieldValue> {
	const artist = entry.artist ?? ({} as DownloadedArtistEntry['artist']);
	return {
		albumIdCount: refCount(entry.albumIds),
		id: present(artist?.id),
		logoUrl: redactUrl(artist?.logoUrl),
		name: present(artist?.name),
	};
}

function playlistSample(entry: DownloadedPlaylistEntry): Record<string, FieldValue> {
	const playlist = entry.playlist ?? ({} as DownloadedPlaylistEntry['playlist']);
	return {
		id: present(playlist?.id),
		imageUrl: redactUrl(playlist?.imageUrl),
		name: present(playlist?.name),
		trackIdCount: refCount(entry.trackIds),
	};
}

function genreSample(entry: DownloadedGenreEntry): Record<string, FieldValue> {
	const genre = entry.genre ?? ({} as DownloadedGenreEntry['genre']);
	return {
		id: present(genre?.id),
		name: present(genre?.name),
		trackIdCount: refCount(entry.trackIds),
	};
}

function safeArray<T>(read: () => Array<T>): Array<T> {
	try {
		const value = read();
		return Array.isArray(value) ? value : [];
	} catch {
		return [];
	}
}

function safeNumber(read: () => number): number {
	try {
		const value = read();
		return Number.isFinite(value) ? value : 0;
	} catch {
		return 0;
	}
}

export function serializeOfflineDiagnostics(report: OfflineDiagnosticsReport): string {
	return JSON.stringify(report, null, 2);
}
