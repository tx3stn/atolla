import { describe, expect, it } from 'bun:test';
import { WriteBehindImageStore } from './WriteBehindImageStore';

const buffer = new Uint8Array([1, 2, 3]).buffer;

class PendingWriteStore {
	private data = new Map<string, ArrayBuffer>();
	resolvers: Array<() => void> = [];
	fetchCalls = 0;

	fetch(key: string): Promise<ArrayBuffer | null> {
		this.fetchCalls += 1;
		return Promise.resolve(this.data.get(key) ?? null);
	}

	store(key: string, value: ArrayBuffer): Promise<void> {
		return new Promise((resolve) => {
			this.resolvers.push(() => {
				this.data.set(key, value);
				resolve();
			});
		});
	}

	remove(key: string): Promise<void> {
		this.data.delete(key);
		return Promise.resolve();
	}

	fetchAll(): Promise<Record<string, ArrayBuffer>> {
		return Promise.resolve(Object.fromEntries(this.data.entries()));
	}

	flush(): void {
		for (const resolve of this.resolvers) {
			resolve();
		}
		this.resolvers = [];
	}

	has(key: string): boolean {
		return this.data.has(key);
	}

	seed(key: string, value: ArrayBuffer): void {
		this.data.set(key, value);
	}
}

describe('WriteBehindImageStore', () => {
	it('returns immediately without waiting for disk writes', async () => {
		const db = new PendingWriteStore();
		const imageStore = new WriteBehindImageStore(db as never);

		await imageStore.store('key', buffer);

		expect(db.has('key')).toBe(false);
	});

	it('serves fetch from memory immediately after store', async () => {
		const db = new PendingWriteStore();
		const imageStore = new WriteBehindImageStore(db as never);

		void imageStore.store('key', buffer);
		const fetched = await imageStore.fetch('key');

		expect(fetched).toEqual(buffer);
		expect(db.fetchCalls).toBe(0);
	});

	it('promotes disk reads into memory cache', async () => {
		const db = new PendingWriteStore();
		db.seed('key', buffer);
		const imageStore = new WriteBehindImageStore(db as never);

		const first = await imageStore.fetch('key');
		const second = await imageStore.fetch('key');

		expect(first).toEqual(buffer);
		expect(second).toEqual(buffer);
		expect(db.fetchCalls).toBe(1);
	});

	it('eventually writes to disk in the background', async () => {
		const db = new PendingWriteStore();
		const imageStore = new WriteBehindImageStore(db as never);

		void imageStore.store('key', buffer);
		db.flush();
		await Promise.resolve();

		expect(db.has('key')).toBe(true);
	});

	it('does not propagate disk write errors', async () => {
		const db = {
			fetch: () => Promise.reject(new Error('missing')),
			fetchAll: () => Promise.resolve({}),
			remove: () => Promise.resolve(),
			store: () => Promise.reject(new Error('disk full')),
		};
		const imageStore = new WriteBehindImageStore(db as never);

		await imageStore.store('key', buffer);
	});

	it('returns null for unknown keys', async () => {
		const db = new PendingWriteStore();
		const imageStore = new WriteBehindImageStore(db as never);

		expect(await imageStore.fetch('unknown')).toBeNull();
		expect(db.fetchCalls).toBe(1);
	});
});
