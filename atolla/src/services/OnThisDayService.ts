import type { Album } from '../models/Album';
import type { Transport } from '../transports/Transport';
import { matchOnThisDay } from './OnThisDay';

// caches albums whose anniversary is today or tomorrow, so the home view renders
// cheaply and survives an offline midnight rollover. recomputed online via a
// two-phase sweep, else served from the date-keyed cache. best-effort, never throws

const CACHE_KEY = 'on_this_day_v1';
// bump to invalidate caches from older logic so a corrected sweep re-runs
const CACHE_VERSION = 2;
export const DISCOVERY_PAGE_SIZE = 200;
const MAX_DISCOVERY_PAGES = 250;

export interface OnThisDayStore {
	fetchString(key: string): Promise<string>;
	storeString(key: string, value: string): Promise<void>;
}

export type OnThisDayTransport = Pick<Transport, 'getAlbumReleaseDates' | 'getAlbumsByIds'>;

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

// local (not UTC) YYYY-MM-DD key for the user's calendar day
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
	// drop entries missing a required string so a tampered cache can't push null
	// across the native bridge
	return { albums: candidate.albums.filter(isAlbum), date: candidate.date };
}

function parseCache(raw: string): OnThisDayCache | null {
	try {
		const parsed = JSON.parse(raw) as Partial<OnThisDayCache>;
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

	async load(): Promise<void> {
		try {
			this.cache = parseCache(await this.store.fetchString(CACHE_KEY));
		} catch {
			this.cache = null;
		}
	}

	ensureLoaded(): Promise<void> {
		if (!this.loadPromise) {
			this.loadPromise = this.load();
		}
		return this.loadPromise;
	}

	getAlbumsForDate(now: Date): Array<Album> {
		const cache = this.cache;
		if (!cache) {
			return [];
		}

		const key = localDateKey(now);
		if (cache.today.date === key) {
			return cache.today.albums;
		}
		// midnight rollover: yesterday's "tomorrow" is today
		if (cache.tomorrow.date === key) {
			return cache.tomorrow.albums;
		}
		return [];
	}

	// recompute today's and tomorrow's albums via a discovery sweep + batch hydrate,
	// then persist. no-op when already fresh (unless forced); never throws
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
			return summary;
		}

		const discover = (page: number, pageSize: number) =>
			transport.getAlbumReleaseDates(page, pageSize);
		const hydrate = (ids: Array<string>) => transport.getAlbumsByIds(ids);

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
			// best-effort: keep the existing cache instead of crashing the toggle
			summary.error = error instanceof Error ? error.message : String(error);
		}

		return summary;
	}

	private async discoverMatchedIds(
		discover: Transport['getAlbumReleaseDates'],
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

			// stop on a short/empty page instead of trusting `hasMore`: some Jellyfin
			// configs report TotalRecordCount as 0, truncating the sweep to page 1
			if (result.items.length < DISCOVERY_PAGE_SIZE) {
				break;
			}
		}

		return { ids: [...ids], scanned, withReleaseDate };
	}
}
