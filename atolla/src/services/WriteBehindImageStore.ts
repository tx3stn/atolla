import type { PersistentStore } from 'persistence/src/PersistentStore';
import type { ImageStore } from './ImageCache';

/**
 * An ImageStore that makes writes fire-and-forget. ImageCache awaits store()
 * before calling notifyStored (which triggers palette extraction). By returning
 * immediately, notifyStored fires as soon as the image is in memory rather than
 * after the disk write completes. Reads (exists/fetch) still wait for disk —
 * on subsequent launches images are served from disk without a network round-trip.
 */
export class WriteBehindImageStore implements ImageStore {
	constructor(private persistentStore: PersistentStore) {}

	exists(key: string): Promise<boolean> {
		return this.persistentStore.exists(key);
	}

	fetch(key: string): Promise<ArrayBuffer> {
		return this.persistentStore.fetch(key);
	}

	store(key: string, value: ArrayBuffer, ttlSeconds?: number, weight?: number): Promise<void> {
		void this.persistentStore.store(key, value, ttlSeconds, weight).catch(() => {});
		return Promise.resolve();
	}

	remove(key: string): Promise<void> {
		return this.persistentStore.remove(key);
	}

	async fetchAll(): Promise<Record<string, unknown>> {
		try {
			return (await this.persistentStore.fetchAll()) as unknown as Record<string, unknown>;
		} catch {
			return {};
		}
	}
}
