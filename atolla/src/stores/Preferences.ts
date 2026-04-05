// @ts-nocheck
import { PersistentStore } from 'persistence/src/PersistentStore';
import { type ConnectionMode, ConnectionModes } from '../transports/Model';

export const DEFAULT_IMAGE_CACHE_MAX_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB
export const TRACK_CACHE_LIMIT_OPTIONS = [10, 15, 20, 25, 30, 35] as const;
export const DEFAULT_TRACK_CACHE_MAX_TRACKS = 20;

interface PreferencesStore {
	fetchString(key: string): Promise<string>;
	storeString(key: string, value: string): Promise<void>;
}

export class Preferences {
	private store: PreferencesStore;

	constructor(store?: PreferencesStore) {
		this.store = store ?? new PersistentStore('preferences', { deviceGlobal: true });
	}

	async getMode(): Promise<ConnectionMode> {
		try {
			return await this.store.fetchString('mode');
		} catch {
			// FIXME: update to online
			return ConnectionModes.mock;
		}
	}

	async setMode(mode: ConnectionMode): Promise<void> {
		await this.store.storeString('mode', mode);
	}

	async getImageCacheMaxBytes(): Promise<number> {
		try {
			return Number(await this.store.fetchString('image_cache_max_bytes'));
		} catch {
			return DEFAULT_IMAGE_CACHE_MAX_BYTES;
		}
	}

	async setImageCacheMaxBytes(bytes: number): Promise<void> {
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
