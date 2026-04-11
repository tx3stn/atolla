// @ts-nocheck
import { PersistentStore } from 'persistence/src/PersistentStore';
import { type ConnectionMode, ConnectionModes } from '../transports/Model';

const MB = 1024 * 1024;
const GB = 1024 * 1024 * 1024;
export const IMAGE_CACHE_SIZE_OPTIONS = [500 * MB, 1 * GB, Math.round(1.5 * GB), 2 * GB] as const;
export const DEFAULT_IMAGE_CACHE_MAX_BYTES = 2 * GB;
export const GRID_COLUMN_OPTIONS = [3, 4] as const;
export const DEFAULT_GRID_COLUMNS = 3;
export const TRACK_CACHE_LIMIT_OPTIONS = [10, 15, 20, 25, 30, 35] as const;
export const DEFAULT_TRACK_CACHE_MAX_TRACKS = 20;

interface PreferencesStore {
	fetchString(key: string): Promise<string>;
	storeString(key: string, value: string): Promise<void>;
}

export class Preferences {
	private store: PreferencesStore;

	constructor(store?: PreferencesStore) {
		this.store = store ?? new PersistentStore('preferences');
	}

	async getMode(): Promise<ConnectionMode> {
		try {
			return await this.store.fetchString('mode');
		} catch {
			return ConnectionModes.offline;
		}
	}

	async setMode(mode: ConnectionMode): Promise<void> {
		await this.store.storeString('mode', mode);
	}

	async getImageCacheMaxBytes(): Promise<number> {
		try {
			const value = Number(await this.store.fetchString('image_cache_max_bytes'));
			if (IMAGE_CACHE_SIZE_OPTIONS.includes(value as (typeof IMAGE_CACHE_SIZE_OPTIONS)[number])) {
				return value;
			}
			return DEFAULT_IMAGE_CACHE_MAX_BYTES;
		} catch {
			return DEFAULT_IMAGE_CACHE_MAX_BYTES;
		}
	}

	async setImageCacheMaxBytes(bytes: number): Promise<void> {
		if (!IMAGE_CACHE_SIZE_OPTIONS.includes(bytes as (typeof IMAGE_CACHE_SIZE_OPTIONS)[number])) {
			return;
		}
		await this.store.storeString('image_cache_max_bytes', String(bytes));
	}

	async getAnimationsEnabled(): Promise<boolean> {
		try {
			return (await this.store.fetchString('navigation_animations_enabled')) !== 'false';
		} catch {
			return true;
		}
	}

	async setAnimationsEnabled(enabled: boolean): Promise<void> {
		await this.store.storeString('navigation_animations_enabled', String(enabled));
	}

	async getGridColumns(): Promise<number> {
		try {
			const value = Number(await this.store.fetchString('grid_columns'));
			if (GRID_COLUMN_OPTIONS.includes(value as (typeof GRID_COLUMN_OPTIONS)[number])) {
				return value;
			}
			return DEFAULT_GRID_COLUMNS;
		} catch {
			return DEFAULT_GRID_COLUMNS;
		}
	}

	async setGridColumns(count: number): Promise<void> {
		if (!GRID_COLUMN_OPTIONS.includes(count as (typeof GRID_COLUMN_OPTIONS)[number])) {
			return;
		}
		await this.store.storeString('grid_columns', String(count));
	}

	async getTrackCacheMaxTracks(): Promise<number> {
		try {
			const value = Number(await this.store.fetchString('track_cache_max_tracks'));
			if (TRACK_CACHE_LIMIT_OPTIONS.includes(value as (typeof TRACK_CACHE_LIMIT_OPTIONS)[number])) {
				return value;
			}
			return DEFAULT_TRACK_CACHE_MAX_TRACKS;
		} catch {
			return DEFAULT_TRACK_CACHE_MAX_TRACKS;
		}
	}

	async setTrackCacheMaxTracks(count: number): Promise<void> {
		if (!TRACK_CACHE_LIMIT_OPTIONS.includes(count as (typeof TRACK_CACHE_LIMIT_OPTIONS)[number])) {
			return;
		}
		await this.store.storeString('track_cache_max_tracks', String(count));
	}
}
