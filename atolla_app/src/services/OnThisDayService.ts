import type { Album } from 'atolla_core/src/models/Album';
import type { Transport } from 'atolla_core/src/transports/Transport';
import { matchOnThisDay } from './OnThisDay';

// caches albums whose anniversary falls in a window starting today, so the home view
// renders cheaply and keeps working while away from the server. the window length is the
// user's configured lookahead. recomputed online via a two-phase sweep, else served from
// the date-keyed cache. best-effort, never throws

const CACHE_KEY = 'on_this_day_v1';
// bump to invalidate caches from older logic so a corrected sweep re-runs
const CACHE_VERSION = 3;
export const DISCOVERY_PAGE_SIZE = 200;
const MAX_DISCOVERY_PAGES = 250;

export interface OnThisDayStore {
	fetchString(key: string): Promise<string>;
	storeString(key: string, value: string): Promise<void>;
}

export type OnThisDayTransport = Pick<Transport, 'getAlbumReleaseDates' | 'getAlbumsByIds'>;

export interface OnThisDayRefreshSummary {
	days: number;
	error?: string;
	hydrated: number;
	matched: number;
	ran: boolean;
	scanned: number;
	today: number;
	upcoming: number;
	withReleaseDate: number;
}

interface DayAlbums {
	albums: Array<Album>;
	date: string;
}

// days[0] is today, days[i] is today + i days
interface OnThisDayCache {
	days: Array<DayAlbums>;
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
		if (parsed?.version !== CACHE_VERSION || !Array.isArray(parsed.days)) {
			return null;
		}
		const days = parsed.days.map(parseDayAlbums).filter((day): day is DayAlbums => day !== null);
		if (days.length === 0) {
			return null;
		}
		return { days, version: CACHE_VERSION };
	} catch {
		return null;
	}
}

function lookaheadDates(now: Date, lookaheadDays: number): Array<Date> {
	return Array.from({ length: Math.max(0, lookaheadDays) + 1 }, (_, offset) =>
		addDays(now, offset),
	);
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

	// any day still inside the cached window answers, so a midnight rollover keeps working
	// offline until the window runs out
	getAlbumsForDate(now: Date): Array<Album> {
		const key = localDateKey(now);
		return this.cache?.days.find((day) => day.date === key)?.albums ?? [];
	}

	getCachedAlbums(): Array<Album> {
		return this.cache?.days.flatMap((day) => day.albums) ?? [];
	}

	// recompute the whole lookahead window via a discovery sweep + batch hydrate, then
	// persist. no-op when the cached window already matches (unless forced); never throws
	async refresh(
		transport: OnThisDayTransport,
		now: Date,
		options: { force?: boolean; lookaheadDays: number },
	): Promise<OnThisDayRefreshSummary> {
		const targets = lookaheadDates(now, options.lookaheadDays);
		const targetKeys = targets.map(localDateKey);
		const cachedDays = this.cache?.days ?? [];
		const summary: OnThisDayRefreshSummary = {
			days: cachedDays.length,
			hydrated: 0,
			matched: 0,
			ran: false,
			scanned: 0,
			today: cachedDays[0]?.albums.length ?? 0,
			upcoming: cachedDays.slice(1).reduce((total, day) => total + day.albums.length, 0),
			withReleaseDate: 0,
		};

		// a changed lookahead shifts the expected keys, so this also catches a resized window
		if (
			!options.force &&
			cachedDays.length === targetKeys.length &&
			cachedDays.every((day, index) => day.date === targetKeys[index])
		) {
			return summary;
		}

		const discover = (page: number, pageSize: number) =>
			transport.getAlbumReleaseDates(page, pageSize);
		const hydrate = (ids: Array<string>) => transport.getAlbumsByIds(ids);

		summary.ran = true;
		try {
			const found = await this.discoverMatchedIds(discover, targets);
			summary.scanned = found.scanned;
			summary.withReleaseDate = found.withReleaseDate;
			summary.matched = found.ids.length;

			const albums = found.ids.length > 0 ? await hydrate(found.ids) : [];
			summary.hydrated = albums.length;

			const next: OnThisDayCache = {
				days: targets.map((target, index) => ({
					albums: albums.filter((album) => matchOnThisDay(album.releaseDate, target)),
					date: targetKeys[index],
				})),
				version: CACHE_VERSION,
			};

			this.cache = next;
			summary.days = next.days.length;
			summary.today = next.days[0].albums.length;
			summary.upcoming = next.days.slice(1).reduce((total, day) => total + day.albums.length, 0);
			await this.store.storeString(CACHE_KEY, JSON.stringify(next));
		} catch (error) {
			// best-effort: keep the existing cache instead of crashing the toggle
			summary.error = error instanceof Error ? error.message : String(error);
		}

		return summary;
	}

	private async discoverMatchedIds(
		discover: Transport['getAlbumReleaseDates'],
		targets: Array<Date>,
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
				if (item.id && targets.some((target) => matchOnThisDay(item.releaseDate, target))) {
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
