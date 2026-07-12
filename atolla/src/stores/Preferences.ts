import { PersistentStore } from 'persistence/src/PersistentStore';
import { type ConnectionMode, ConnectionModes } from '../transports/Model';

const GB = 1024 * 1024 * 1024;
export const IMAGE_CACHE_SIZE_OPTIONS = [
	1 * GB,
	Math.round(1.5 * GB),
	2 * GB,
	Math.round(2.5 * GB),
	3 * GB,
];
export const DEFAULT_IMAGE_CACHE_MAX_BYTES = 2 * GB;
export const GRID_COLUMN_OPTIONS = [3, 4];
export const DEFAULT_GRID_COLUMNS = 3;
export const TRACK_CACHE_LIMIT_OPTIONS = [10, 15, 20, 25, 30, 35];
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
	// optional: not every backend can report key existence (some test fakes only fetch/store). When
	// it is absent hasMode() treats the mode as never stored, which is the correct fresh-install answer.
	exists?(key: string): Promise<boolean>;
	fetchString(key: string): Promise<string>;
	storeString(key: string, value: string): Promise<void>;
}

// Write-through observable cache over the persistence port: in-memory fields are the source of
// truth for synchronous reads (so components can read in onRender), setters update the field +
// notify subscribers then persist, and load() hydrates the fields once at bootstrap. The async
// get*() methods read straight from the backing store and remain for the bootstrap hydration path.
export class Preferences {
	private store: PreferencesStore;
	private listeners = new Set<() => void>();

	private _animationsEnabled = true;
	private _debugLoggingEnabled = false;
	private _gridColumns = DEFAULT_GRID_COLUMNS;
	private _hasStoredMode = false;
	private _imageCacheMaxBytes = DEFAULT_IMAGE_CACHE_MAX_BYTES;
	private _jellyfinClientDeviceIdOverride = '';
	private _language: LanguageCode = DEFAULT_LANGUAGE;
	private _mode: ConnectionMode = ConnectionModes.offline;
	private _trackCacheMaxTracks = DEFAULT_TRACK_CACHE_MAX_TRACKS;

	constructor(store?: PreferencesStore) {
		this.store = store ?? new PersistentStore('preferences');
	}

	get animationsEnabled(): boolean {
		return this._animationsEnabled;
	}

	get debugLoggingEnabled(): boolean {
		return this._debugLoggingEnabled;
	}

	get gridColumns(): number {
		return this._gridColumns;
	}

	// Whether a connection mode has ever been persisted. Offline mode is only reachable after the
	// user has connected at least once, so a device with no stored mode has never been set up — the
	// cold-start launch decision uses this to send a fresh install to the connection screen rather
	// than into the app on the empty offline transport.
	get hasStoredMode(): boolean {
		return this._hasStoredMode;
	}

	get imageCacheMaxBytes(): number {
		return this._imageCacheMaxBytes;
	}

	get jellyfinClientDeviceIdOverride(): string {
		return this._jellyfinClientDeviceIdOverride;
	}

	get language(): LanguageCode {
		return this._language;
	}

	get mode(): ConnectionMode {
		return this._mode;
	}

	get trackCacheMaxTracks(): number {
		return this._trackCacheMaxTracks;
	}

	async getAnimationsEnabled(): Promise<boolean> {
		try {
			return (await this.store.fetchString(PreferenceKeys.navigationAnimationsEnabled)) !== 'false';
		} catch {
			return true;
		}
	}

	async getDebugLoggingEnabled(): Promise<boolean> {
		try {
			return (await this.store.fetchString(PreferenceKeys.debugLoggingEnabled)) === 'true';
		} catch {
			return false;
		}
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

	async getJellyfinClientDeviceIdOverride(): Promise<string> {
		try {
			return (await this.store.fetchString(PreferenceKeys.jellyfinClientDeviceIdOverride)).trim();
		} catch {
			return '';
		}
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

	async getMode(): Promise<ConnectionMode> {
		try {
			const value = await this.store.fetchString(PreferenceKeys.mode);
			const validModes: ReadonlyArray<string> = Object.values(ConnectionModes);
			return validModes.includes(value) ? (value as ConnectionMode) : ConnectionModes.offline;
		} catch {
			return ConnectionModes.offline;
		}
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

	async hasMode(): Promise<boolean> {
		try {
			return (await this.store.exists?.(PreferenceKeys.mode)) ?? false;
		} catch {
			return false;
		}
	}

	async load(): Promise<void> {
		const [
			animationsEnabled,
			debugLoggingEnabled,
			gridColumns,
			hasStoredMode,
			imageCacheMaxBytes,
			jellyfinClientDeviceIdOverride,
			language,
			mode,
			trackCacheMaxTracks,
		] = await Promise.all([
			this.getAnimationsEnabled(),
			this.getDebugLoggingEnabled(),
			this.getGridColumns(),
			this.hasMode(),
			this.getImageCacheMaxBytes(),
			this.getJellyfinClientDeviceIdOverride(),
			this.getLanguage(),
			this.getMode(),
			this.getTrackCacheMaxTracks(),
		]);
		this._animationsEnabled = animationsEnabled;
		this._debugLoggingEnabled = debugLoggingEnabled;
		this._gridColumns = gridColumns;
		this._hasStoredMode = hasStoredMode;
		this._imageCacheMaxBytes = imageCacheMaxBytes;
		this._jellyfinClientDeviceIdOverride = jellyfinClientDeviceIdOverride;
		this._language = language;
		this._mode = mode;
		this._trackCacheMaxTracks = trackCacheMaxTracks;
		this.notify();
	}

	setAnimationsEnabled(enabled: boolean): Promise<void> {
		this._animationsEnabled = enabled;
		this.notify();
		return this.store.storeString(PreferenceKeys.navigationAnimationsEnabled, String(enabled));
	}

	setDebugLoggingEnabled(enabled: boolean): Promise<void> {
		this._debugLoggingEnabled = enabled;
		this.notify();
		return this.store.storeString(PreferenceKeys.debugLoggingEnabled, String(enabled));
	}

	setGridColumns(count: number): Promise<void> {
		if (!GRID_COLUMN_OPTIONS.includes(count as (typeof GRID_COLUMN_OPTIONS)[number])) {
			return Promise.resolve();
		}
		this._gridColumns = count;
		this.notify();
		return this.store.storeString(PreferenceKeys.gridColumns, String(count));
	}

	setImageCacheMaxBytes(bytes: number): Promise<void> {
		if (!IMAGE_CACHE_SIZE_OPTIONS.includes(bytes as (typeof IMAGE_CACHE_SIZE_OPTIONS)[number])) {
			return Promise.resolve();
		}
		this._imageCacheMaxBytes = bytes;
		this.notify();
		return this.store.storeString(PreferenceKeys.imageCacheMaxBytes, String(bytes));
	}

	setJellyfinClientDeviceIdOverride(value: string): Promise<void> {
		const normalized = value.trim();
		this._jellyfinClientDeviceIdOverride = normalized;
		this.notify();
		return this.store.storeString(PreferenceKeys.jellyfinClientDeviceIdOverride, normalized);
	}

	setLanguage(code: LanguageCode): Promise<void> {
		this._language = code;
		this.notify();
		return this.store.storeString(PreferenceKeys.language, code);
	}

	setMode(mode: ConnectionMode): Promise<void> {
		this._mode = mode;
		this._hasStoredMode = true;
		this.notify();
		return this.store.storeString(PreferenceKeys.mode, mode);
	}

	setTrackCacheMaxTracks(count: number): Promise<void> {
		if (!TRACK_CACHE_LIMIT_OPTIONS.includes(count as (typeof TRACK_CACHE_LIMIT_OPTIONS)[number])) {
			return Promise.resolve();
		}
		this._trackCacheMaxTracks = count;
		this.notify();
		return this.store.storeString(PreferenceKeys.trackCacheMaxTracks, String(count));
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify(): void {
		for (const listener of [...this.listeners]) {
			listener();
		}
	}
}
