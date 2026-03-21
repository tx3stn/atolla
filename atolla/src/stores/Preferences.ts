// @ts-nocheck
import { PersistentStore } from 'persistence/src/PersistentStore';
import { type ConnectionMode, ConnectionModes } from '../transports/Model';

export const DEFAULT_IMAGE_CACHE_MAX_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

export class Preferences {
	private store = new PersistentStore('preferences', { deviceGlobal: true });

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
}
