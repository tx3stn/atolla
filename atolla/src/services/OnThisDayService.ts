import type { Album } from '../models/Album';
import { matchOnThisDay } from './OnThisDay';

// Discovers and caches the albums whose anniversary falls today or tomorrow, so
// the home render works from a handful of albums instead of the whole library and
// an offline midnight rollover is seamless. The library is never mirrored locally
// — we recompute (online) via a lightweight two-phase sweep and otherwise fall
// back to the date-keyed cache. Returns albums (not cards) so the view can both
// render them and open them on tap. Every method is best-effort and never throws
// on the reconnect/render path.

const CACHE_KEY = 'on_this_day_v1';
// Bump to invalidate caches written by older logic (e.g. an empty result from a
// truncated discovery sweep) so a corrected sweep re-runs instead of being
// treated as "fresh".
const CACHE_VERSION = 2;
export const DISCOVERY_PAGE_SIZE = 200;
// Hard stop so a pathological/looping transport can never sweep forever.
const MAX_DISCOVERY_PAGES = 250;

export interface OnThisDayStore {
	fetchString(key: string): Promise<string>;
	storeString(key: string, value: string): Promise<void>;
}

export interface OnThisDayTransport {
	getAlbumReleaseDatesPage?: (
		page: number,
		pageSize: number,
	) => Promise<{ hasMore: boolean; items: Array<{ id: string; releaseDate?: string }> }>;
	getAlbumsByIds?: (ids: Array<string>) => Promise<Array<Album>>;
}

/** Funnel counts from a refresh, for diagnosing where an empty result originated. */
export interface OnThisDayRefreshSummary {
	error?: string;
	hydrated: number;
	matched: number;
	ran: boolean;
	scanned: number;
	today: number;
	tomorrow: number;
	withReleaseDate: number;
}

interface DayAlbums {
	albums: Array<Album>;
	date: string;
}

interface OnThisDayCache {
	today: DayAlbums;
	tomorrow: DayAlbums;
	version: number;
}

/** Local YYYY-MM-DD key — "today" is the user's local calendar day. */
export function localDateKey(date: Date): string {
	const year = date.getFullYear();
	const month = `${date.getMonth() + 1}`.padStart(2, '0');
	const day = `${date.getDate()}`.padStart(2, '0');
	return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
	const next = new Date(date);
	next.setDate(next.getDate() + days);
	return next;
}

function isAlbum(value: unknown): value is Album {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const album = value as Record<string, unknown>;
	return (
		typeof album.id === 'string' &&
		typeof album.name === 'string' &&
		typeof album.artistId === 'string' &&
		typeof album.artistName === 'string'
	);
}

function parseDayAlbums(value: unknown): DayAlbums | null {
	if (!value || typeof value !== 'object') {
		return null;
	}
	const candidate = value as Partial<DayAlbums>;
	if (typeof candidate.date !== 'string' || !Array.isArray(candidate.albums)) {
		return null;
	}
	// Drop anything that lost a required string field so a tampered/legacy cache
	// can never push null/undefined text across the native bridge on render.
	return { albums: candidate.albums.filter(isAlbum), date: candidate.date };
}

function parseCache(raw: string): OnThisDayCache | null {
	try {
		const parsed = JSON.parse(raw) as Partial<OnThisDayCache>;
		// Discard caches from an older version so corrected logic re-runs.
		if (parsed?.version !== CACHE_VERSION) {
			return null;
		}
		const today = parseDayAlbums(parsed.today);
		const tomorrow = parseDayAlbums(parsed.tomorrow);
		if (!today || !tomorrow) {
			return null;
		}
		return { today, tomorrow, version: CACHE_VERSION };
	} catch {
		return null;
	}
}

export class OnThisDayService {
	private cache: OnThisDayCache | null = null;
	private loadPromise: Promise<void> | null = null;

	constructor(private readonly store: OnThisDayStore) {}

	/** Hydrate the in-memory cache from the persisted blob (call once on boot). */
	async load(): Promise<void> {
		try {
			this.cache = parseCache(await this.store.fetchString(CACHE_KEY));
		} catch {
			this.cache = null;
		}
	}

	/** Loads from disk at most once; callers can await this before reading. */
	ensureLoaded(): Promise<void> {
		if (!this.loadPromise) {
			this.loadPromise = this.load();
		}
		return this.loadPromise;
	}

	/** Synchronous read for the render path — [] when nothing is cached for `now`. */
	getAlbumsForDate(now: Date): Array<Album> {
		const cache = this.cache;
		if (!cache) {
			return [];
		}

		const key = localDateKey(now);
		if (cache.today.date === key) {
			return cache.today.albums;
		}
		// Seamless midnight rollover: yesterday's "tomorrow" is today.
		if (cache.tomorrow.date === key) {
			return cache.tomorrow.albums;
		}
		return [];
	}

	/**
	 * Recompute today's + tomorrow's albums via a lightweight discovery sweep and a
	 * single batch hydrate, then persist. No-op when already fresh (unless forced)
	 * or when the transport can't discover/hydrate. Never throws. Returns a funnel
	 * summary so callers can log exactly where an empty result came from.
	 */
	async refresh(
		transport: OnThisDayTransport,
		now: Date,
		options: { force?: boolean } = {},
	): Promise<OnThisDayRefreshSummary> {
		const todayKey = localDateKey(now);
		const tomorrow = addDays(now, 1);
		const tomorrowKey = localDateKey(tomorrow);
		const summary: OnThisDayRefreshSummary = {
			hydrated: 0,
			matched: 0,
			ran: false,
			scanned: 0,
			today: this.cache?.today.albums.length ?? 0,
			tomorrow: this.cache?.tomorrow.albums.length ?? 0,
			withReleaseDate: 0,
		};

		if (
			!options.force &&
			this.cache &&
			this.cache.today.date === todayKey &&
			this.cache.tomorrow.date === tomorrowKey
		) {
			return summary; // already fresh
		}

		// Bind to the transport — these are class methods that use `this` internally,
		// so calling an extracted reference unbound would throw.
		const discover = transport.getAlbumReleaseDatesPage?.bind(transport);
		const hydrate = transport.getAlbumsByIds?.bind(transport);
		if (!discover || !hydrate) {
			return summary; // transport can't refresh; keep the cache
		}

		summary.ran = true;
		try {
			const found = await this.discoverMatchedIds(discover, now, tomorrow);
			summary.scanned = found.scanned;
			summary.withReleaseDate = found.withReleaseDate;
			summary.matched = found.ids.length;

			const albums = found.ids.length > 0 ? await hydrate(found.ids) : [];
			summary.hydrated = albums.length;

			const next: OnThisDayCache = {
				today: {
					albums: albums.filter((album) => matchOnThisDay(album.releaseDate, now)),
					date: todayKey,
				},
				tomorrow: {
					albums: albums.filter((album) => matchOnThisDay(album.releaseDate, tomorrow)),
					date: tomorrowKey,
				},
				version: CACHE_VERSION,
			};

			this.cache = next;
			summary.today = next.today.albums.length;
			summary.tomorrow = next.tomorrow.albums.length;
			await this.store.storeString(CACHE_KEY, JSON.stringify(next));
		} catch (error) {
			// Best-effort: keep the existing cache rather than crash the toggle path.
			summary.error = error instanceof Error ? error.message : String(error);
		}

		return summary;
	}

	private async discoverMatchedIds(
		discover: NonNullable<OnThisDayTransport['getAlbumReleaseDatesPage']>,
		today: Date,
		tomorrow: Date,
	): Promise<{ ids: Array<string>; scanned: number; withReleaseDate: number }> {
		const ids = new Set<string>();
		let scanned = 0;
		let withReleaseDate = 0;

		for (let page = 1; page <= MAX_DISCOVERY_PAGES; page += 1) {
			const result = await discover(page, DISCOVERY_PAGE_SIZE);
			for (const item of result.items) {
				scanned += 1;
				if (item.releaseDate) {
					withReleaseDate += 1;
				}
				if (
					item.id &&
					(matchOnThisDay(item.releaseDate, today) || matchOnThisDay(item.releaseDate, tomorrow))
				) {
					ids.add(item.id);
				}
			}

			// Terminate on a short/empty page rather than trusting `hasMore`: some
			// Jellyfin configs report TotalRecordCount as 0, which would otherwise
			// truncate the sweep to the first (newest) page and miss old anniversaries.
			if (result.items.length < DISCOVERY_PAGE_SIZE) {
				break;
			}
		}

		return { ids: [...ids], scanned, withReleaseDate };
	}
}
