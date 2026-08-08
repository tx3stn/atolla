import { PersistentStore } from 'persistence/src/PersistentStore';
import { Device } from 'valdi_core/src/Device';
import { type CardSize, CardSizes, type ConnectionMode, ConnectionModes } from '../models/App';
import { deriveGridColumns } from '../utils/GridColumns';

export const GB = 1024 * 1024 * 1024;
export const IMAGE_CACHE_SIZE_OPTIONS = [1 * GB, 2 * GB, 3 * GB, 5 * GB, 0];
export const DEFAULT_IMAGE_CACHE_MAX_BYTES = 2 * GB;
export const CARD_SIZE_OPTIONS: ReadonlyArray<CardSize> = [CardSizes.regular, CardSizes.small];
export const DEFAULT_CARD_SIZE: CardSize = CardSizes.regular;
export const TRACK_CACHE_LIMIT_OPTIONS = [10, 15, 20, 25, 30, 35];
export const DEFAULT_TRACK_CACHE_MAX_TRACKS = 20;

export const LANGUAGE_OPTIONS = [
	{ code: 'en', flag: '🇬🇧', name: 'English' },
	{ code: 'fr', flag: '🇫🇷', name: 'Français' },
] as const;
export type LanguageCode = (typeof LANGUAGE_OPTIONS)[number]['code'];
export const DEFAULT_LANGUAGE: LanguageCode = 'en';

const PreferenceKeys = {
	cardSize: 'card_size',
	debugLoggingEnabled: 'debug_logging_enabled',
	downloadOnWifiOnly: 'download_on_wifi_only',
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
	private _cardSize: CardSize = DEFAULT_CARD_SIZE;
	private _debugLoggingEnabled = false;
	private _downloadOnWifiOnly = false;
	private _hasStoredMode = false;
	private _imageCacheMaxBytes = DEFAULT_IMAGE_CACHE_MAX_BYTES;
	private _jellyfinClientDeviceIdOverride = '';
	private _language: LanguageCode = DEFAULT_LANGUAGE;
	private _mode: ConnectionMode = ConnectionModes.offline;
	private _trackCacheMaxTracks = DEFAULT_TRACK_CACHE_MAX_TRACKS;

	constructor(
		store?: PreferencesStore,
		private windowWidth: number = Device.getWindowWidth(),
	) {
		this.store = store ?? new PersistentStore('preferences');
	}

	get animationsEnabled(): boolean {
		return this._animationsEnabled;
	}

	get cardSize(): CardSize {
		return this._cardSize;
	}

	get debugLoggingEnabled(): boolean {
		return this._debugLoggingEnabled;
	}

	get downloadOnWifiOnly(): boolean {
		return this._downloadOnWifiOnly;
	}

	// derived rather than stored: the card size fixes a target card width and the window decides how
	// many of them fit, so a wider screen shows more cards rather than the same few stretched out
	get gridColumns(): number {
		return deriveGridColumns(this.windowWidth, this._cardSize);
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

	async getCardSize(): Promise<CardSize> {
		try {
			const value = await this.store.fetchString(PreferenceKeys.cardSize);
			if (CARD_SIZE_OPTIONS.includes(value as CardSize)) {
				return value as CardSize;
			}
			return DEFAULT_CARD_SIZE;
		} catch {
			return DEFAULT_CARD_SIZE;
		}
	}

	async getDebugLoggingEnabled(): Promise<boolean> {
		try {
			return (await this.store.fetchString(PreferenceKeys.debugLoggingEnabled)) === 'true';
		} catch {
			return false;
		}
	}

	async getDownloadOnWifiOnly(): Promise<boolean> {
		try {
			return (await this.store.fetchString(PreferenceKeys.downloadOnWifiOnly)) === 'true';
		} catch {
			return false;
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
			cardSize,
			debugLoggingEnabled,
			downloadOnWifiOnly,
			hasStoredMode,
			imageCacheMaxBytes,
			jellyfinClientDeviceIdOverride,
			language,
			mode,
			trackCacheMaxTracks,
		] = await Promise.all([
			this.getAnimationsEnabled(),
			this.getCardSize(),
			this.getDebugLoggingEnabled(),
			this.getDownloadOnWifiOnly(),
			this.hasMode(),
			this.getImageCacheMaxBytes(),
			this.getJellyfinClientDeviceIdOverride(),
			this.getLanguage(),
			this.getMode(),
			this.getTrackCacheMaxTracks(),
		]);
		this._animationsEnabled = animationsEnabled;
		this._cardSize = cardSize;
		this._debugLoggingEnabled = debugLoggingEnabled;
		this._downloadOnWifiOnly = downloadOnWifiOnly;
		this._hasStoredMode = hasStoredMode;
		this._imageCacheMaxBytes = imageCacheMaxBytes;
		this._jellyfinClientDeviceIdOverride = jellyfinClientDeviceIdOverride;
		this._language = language;
		this._mode = mode;
		this._trackCacheMaxTracks = trackCacheMaxTracks;
		this.notify();
	}

	setAnimationsEnabled(enabled: boolean): Promise<void> {
		if (this._animationsEnabled !== enabled) {
			this._animationsEnabled = enabled;
			this.notify();
		}
		return this.store.storeString(PreferenceKeys.navigationAnimationsEnabled, String(enabled));
	}

	setCardSize(size: CardSize): Promise<void> {
		if (!CARD_SIZE_OPTIONS.includes(size)) {
			return Promise.resolve();
		}
		if (this._cardSize !== size) {
			this._cardSize = size;
			this.notify();
		}
		return this.store.storeString(PreferenceKeys.cardSize, size);
	}

	setDebugLoggingEnabled(enabled: boolean): Promise<void> {
		if (this._debugLoggingEnabled !== enabled) {
			this._debugLoggingEnabled = enabled;
			this.notify();
		}
		return this.store.storeString(PreferenceKeys.debugLoggingEnabled, String(enabled));
	}

	setDownloadOnWifiOnly(enabled: boolean): Promise<void> {
		if (this._downloadOnWifiOnly !== enabled) {
			this._downloadOnWifiOnly = enabled;
			this.notify();
		}
		return this.store.storeString(PreferenceKeys.downloadOnWifiOnly, String(enabled));
	}

	setImageCacheMaxBytes(bytes: number): Promise<void> {
		if (!IMAGE_CACHE_SIZE_OPTIONS.includes(bytes as (typeof IMAGE_CACHE_SIZE_OPTIONS)[number])) {
			return Promise.resolve();
		}
		if (this._imageCacheMaxBytes !== bytes) {
			this._imageCacheMaxBytes = bytes;
			this.notify();
		}
		return this.store.storeString(PreferenceKeys.imageCacheMaxBytes, String(bytes));
	}

	setJellyfinClientDeviceIdOverride(value: string): Promise<void> {
		const normalized = value.trim();
		if (this._jellyfinClientDeviceIdOverride !== normalized) {
			this._jellyfinClientDeviceIdOverride = normalized;
			this.notify();
		}
		return this.store.storeString(PreferenceKeys.jellyfinClientDeviceIdOverride, normalized);
	}

	setLanguage(code: LanguageCode): Promise<void> {
		if (this._language !== code) {
			this._language = code;
			this.notify();
		}
		return this.store.storeString(PreferenceKeys.language, code);
	}

	// re-selecting the current mode on a fresh install still flips hasStoredMode, which the
	// cold-start launch decision reads, so that counts as a change even when the mode matches
	setMode(mode: ConnectionMode): Promise<void> {
		if (this._mode !== mode || !this._hasStoredMode) {
			this._mode = mode;
			this._hasStoredMode = true;
			this.notify();
		}
		return this.store.storeString(PreferenceKeys.mode, mode);
	}

	setTrackCacheMaxTracks(count: number): Promise<void> {
		if (!TRACK_CACHE_LIMIT_OPTIONS.includes(count as (typeof TRACK_CACHE_LIMIT_OPTIONS)[number])) {
			return Promise.resolve();
		}
		if (this._trackCacheMaxTracks !== count) {
			this._trackCacheMaxTracks = count;
			this.notify();
		}
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
