import type { PersistentStore } from 'persistence/src/PersistentStore';
import { DiskWriteWorker } from './DiskWriteWorker';
import type { ImageStore } from './ImageCache';

/**
 * An ImageStore that makes writes fire-and-forget. ImageCache awaits store()
 * before calling notifyStored (which triggers palette extraction). By returning
 * immediately, notifyStored fires as soon as the image is in memory rather than
 * after the disk write completes. fetch() checks the in-memory layer first, then
 * disk — returning null on miss so callers avoid a separate exists() roundtrip.
 * On subsequent launches images are served from disk without a network round-trip.
 */
export class WriteBehindImageStore implements ImageStore {
	private memory = new Map<string, ArrayBuffer>();
	private pendingWrites = new Map<
		string,
		{ ttlSeconds?: number; value: ArrayBuffer; weight?: number }
	>();
	private writeWorker = new DiskWriteWorker();
	private writeDrainQueued = false;

	constructor(private persistentStore: PersistentStore) {}

	async fetch(key: string): Promise<ArrayBuffer | null> {
		const cached = this.memory.get(key);
		if (cached) {
			return cached;
		}

		try {
			const fromDisk = await this.persistentStore.fetch(key);
			if (fromDisk !== null) {
				this.memory.set(key, fromDisk);
			}
			return fromDisk;
		} catch {
			return null;
		}
	}

	store(key: string, value: ArrayBuffer, ttlSeconds?: number, weight?: number): Promise<void> {
		this.memory.set(key, value);
		this.pendingWrites.set(key, { ttlSeconds, value, weight });
		this.queueDrainWrites();
		return Promise.resolve();
	}

	remove(key: string): Promise<void> {
		this.memory.delete(key);
		this.pendingWrites.delete(key);
		return this.persistentStore.remove(key);
	}

	async fetchAll(): Promise<Record<string, unknown>> {
		try {
			const persistent =
				((await this.persistentStore.fetchAll()) as unknown as Record<string, unknown>) ?? {};
			return {
				...persistent,
				...Object.fromEntries(this.memory.entries()),
			};
		} catch {
			return Object.fromEntries(this.memory.entries()) as Record<string, unknown>;
		}
	}

	private queueDrainWrites(): void {
		if (this.writeDrainQueued) {
			return;
		}
		this.writeDrainQueued = true;
		this.writeWorker.enqueue(async () => {
			this.writeDrainQueued = false;
			await this.drainWrites();
		});
	}

	private async drainWrites(): Promise<void> {
		while (this.pendingWrites.size > 0) {
			const next = this.pendingWrites.entries().next().value;
			if (!next) {
				return;
			}

			const [key, write] = next;
			this.pendingWrites.delete(key);

			try {
				await this.persistentStore.store(key, write.value, write.ttlSeconds, write.weight);
			} catch {
				// Best effort background persistence.
			}
		}
	}
}
