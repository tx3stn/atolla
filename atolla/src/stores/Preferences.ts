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

export const LANGUAGE_OPTIONS = [
	{ code: 'en', flag: '🇬🇧', name: 'English' },
	{ code: 'fr', flag: '🇫🇷', name: 'Français' },
] as const;
export type LanguageCode = (typeof LANGUAGE_OPTIONS)[number]['code'];
export const DEFAULT_LANGUAGE: LanguageCode = 'en';

const PreferenceKeys = {
	debugLoggingEnabled: 'debug_logging_enabled',
	gridColumns: 'grid_columns',
	imageCacheMaxBytes: 'image_cache_max_bytes',
	jellyfinClientDeviceIdOverride: 'jellyfin_client_device_id_override',
	language: 'language',
	mode: 'mode',
	navigationAnimationsEnabled: 'navigation_animations_enabled',
	trackCacheMaxTracks: 'track_cache_max_tracks',
} as const;

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
			const value = await this.store.fetchString(PreferenceKeys.mode);
			const validModes: ReadonlyArray<string> = Object.values(ConnectionModes);
			return validModes.includes(value) ? (value as ConnectionMode) : ConnectionModes.offline;
		} catch {
			return ConnectionModes.offline;
		}
	}

	async setMode(mode: ConnectionMode): Promise<void> {
		await this.store.storeString(PreferenceKeys.mode, mode);
	}

	async getImageCacheMaxBytes(): Promise<number> {
		try {
			const value = Number(await this.store.fetchString(PreferenceKeys.imageCacheMaxBytes));
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
		await this.store.storeString(PreferenceKeys.imageCacheMaxBytes, String(bytes));
	}

	async getAnimationsEnabled(): Promise<boolean> {
		try {
			return (await this.store.fetchString(PreferenceKeys.navigationAnimationsEnabled)) !== 'false';
		} catch {
			return true;
		}
	}

	async setAnimationsEnabled(enabled: boolean): Promise<void> {
		await this.store.storeString(PreferenceKeys.navigationAnimationsEnabled, String(enabled));
	}

	async getGridColumns(): Promise<number> {
		try {
			const value = Number(await this.store.fetchString(PreferenceKeys.gridColumns));
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
		await this.store.storeString(PreferenceKeys.gridColumns, String(count));
	}

	async getTrackCacheMaxTracks(): Promise<number> {
		try {
			const value = Number(await this.store.fetchString(PreferenceKeys.trackCacheMaxTracks));
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
		await this.store.storeString(PreferenceKeys.trackCacheMaxTracks, String(count));
	}

	async getJellyfinClientDeviceIdOverride(): Promise<string> {
		try {
			return (await this.store.fetchString(PreferenceKeys.jellyfinClientDeviceIdOverride)).trim();
		} catch {
			return '';
		}
	}

	async setJellyfinClientDeviceIdOverride(value: string): Promise<void> {
		await this.store.storeString(PreferenceKeys.jellyfinClientDeviceIdOverride, value.trim());
	}

	async getLanguage(): Promise<LanguageCode> {
		try {
			const value = await this.store.fetchString(PreferenceKeys.language);
			if (LANGUAGE_OPTIONS.some((opt) => opt.code === value)) {
				return value as LanguageCode;
			}
			return DEFAULT_LANGUAGE;
		} catch {
			return DEFAULT_LANGUAGE;
		}
	}

	async setLanguage(code: LanguageCode): Promise<void> {
		await this.store.storeString(PreferenceKeys.language, code);
	}

	async getDebugLoggingEnabled(): Promise<boolean> {
		try {
			return (await this.store.fetchString(PreferenceKeys.debugLoggingEnabled)) === 'true';
		} catch {
			return false;
		}
	}

	async setDebugLoggingEnabled(enabled: boolean): Promise<void> {
		await this.store.storeString(PreferenceKeys.debugLoggingEnabled, String(enabled));
	}
}
