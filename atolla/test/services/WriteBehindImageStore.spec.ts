// @ts-nocheck
import 'jasmine/src/jasmine';
import { WriteBehindImageStore } from 'atolla/src/services/WriteBehindImageStore';

const buffer = new Uint8Array([1, 2, 3]).buffer;

class PendingWriteStore {
	private data = new Map();
	resolvers = [];

	exists(key) {
		return Promise.resolve(this.data.has(key));
	}

	fetch(key) {
		const value = this.data.get(key);
		return value ? Promise.resolve(value) : Promise.reject(new Error('not found'));
	}

	store(key, value) {
		return new Promise((resolve) => {
			this.resolvers.push(() => {
				this.data.set(key, value);
				resolve();
			});
		});
	}

	remove(key) {
		this.data.delete(key);
		return Promise.resolve();
	}

	fetchAll() {
		return Promise.resolve(Object.fromEntries(this.data));
	}

	flush() {
		for (const resolve of this.resolvers) resolve();
		this.resolvers = [];
	}

	has(key) {
		return this.data.has(key);
	}
}

describe('WriteBehindImageStore', () => {
	describe('store()', () => {
		it('returns immediately without waiting for the underlying store', async () => {
			const db = new PendingWriteStore();
			const imageStore = new WriteBehindImageStore(db);

			await imageStore.store('key', buffer);

			expect(db.has('key')).toBe(false);
		});

		it('eventually writes to the underlying store in the background', async () => {
			const db = new PendingWriteStore();
			const imageStore = new WriteBehindImageStore(db);

			void imageStore.store('key', buffer);
			db.flush();
			await Promise.resolve();

			expect(db.has('key')).toBe(true);
		});

		it('does not propagate errors from the underlying store', async () => {
			const db = {
				exists: () => Promise.resolve(false),
				fetch: () => Promise.reject(new Error()),
				fetchAll: () => Promise.resolve({}),
				remove: () => Promise.resolve(),
				store: () => Promise.reject(new Error('disk full')),
			};
			const imageStore = new WriteBehindImageStore(db);

			await expectAsync(imageStore.store('key', buffer)).toBeResolvedTo(undefined);
		});
	});

	describe('exists()', () => {
		it('returns false for unknown keys', async () => {
			const imageStore = new WriteBehindImageStore(new PendingWriteStore());
			expect(await imageStore.exists('missing')).toBe(false);
		});

		it('returns true after the background write completes', async () => {
			const db = new PendingWriteStore();
			const imageStore = new WriteBehindImageStore(db);

			void imageStore.store('key', buffer);
			db.flush();
			await Promise.resolve();

			expect(await imageStore.exists('key')).toBe(true);
		});
	});

	describe('fetch()', () => {
		it('returns the stored buffer after write completes', async () => {
			const db = new PendingWriteStore();
			const imageStore = new WriteBehindImageStore(db);

			void imageStore.store('key', buffer);
			db.flush();
			await Promise.resolve();

			expect(await imageStore.fetch('key')).toEqual(buffer);
		});

		it('rejects for unknown keys', async () => {
			const imageStore = new WriteBehindImageStore(new PendingWriteStore());
			await expectAsync(imageStore.fetch('missing')).toBeRejected();
		});
	});

	describe('remove()', () => {
		it('removes an entry from the underlying store', async () => {
			const db = new PendingWriteStore();
			const imageStore = new WriteBehindImageStore(db);

			void imageStore.store('key', buffer);
			db.flush();
			await Promise.resolve();
			await imageStore.remove('key');

			expect(await imageStore.exists('key')).toBe(false);
		});
	});

	describe('fetchAll()', () => {
		it('returns an empty object when the store errors', async () => {
			const db = {
				exists: () => Promise.resolve(false),
				fetch: () => Promise.reject(new Error()),
				fetchAll: () => Promise.reject(new Error('unavailable')),
				remove: () => Promise.resolve(),
				store: () => Promise.resolve(),
			};
			const imageStore = new WriteBehindImageStore(db);
			expect(await imageStore.fetchAll()).toEqual({});
		});
	});
});
