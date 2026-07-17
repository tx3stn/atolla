import 'jasmine/src/jasmine';
import { ViewCache, type ViewCacheDiskStore } from 'atolla/src/services/ViewCache';

const albums = [{ artistId: 'a1', artistName: 'Converge', id: 'al1', name: 'Jane Doe' }];
type AlbumRow = (typeof albums)[number];
type Node = { id: string };

describe('ViewCache', () => {
	it('get misses before a store and hits synchronously after', () => {
		const cache = new ViewCache({ disk: new FakeDisk(), maxEntries: 8 });

		expect(cache.get('list:albums')).toBeUndefined();

		cache.store('list:albums', albums);

		expect(cache.get<typeof albums>('list:albums')).toEqual(albums);
	});

	it('persists to disk and hydrates a fresh cache via load', async () => {
		const disk = new FakeDisk();
		new ViewCache({ disk, maxEntries: 8 }).store('album:al1', albums[0]);

		const fresh = new ViewCache({ disk, maxEntries: 8 });
		expect(fresh.get('album:al1')).toBeUndefined();

		expect(await fresh.load<AlbumRow>('album:al1')).toEqual(albums[0]);
		// load hydrated memory, so a subsequent sync get now hits
		expect(fresh.get<AlbumRow>('album:al1')).toEqual(albums[0]);
	});

	it('forwards the serialized byte weight to the disk store for LRU accounting', () => {
		const disk = new FakeDisk();
		const cache = new ViewCache({ disk, maxEntries: 8 });

		cache.store('album:al1', albums[0]);

		const [storedKey] = [...disk.values.keys()];
		expect(disk.weights.get(storedKey)).toBe(disk.values.get(storedKey)?.length);
	});

	it('evicts the least-recently-used entry from memory past maxEntries but keeps it on disk', async () => {
		const disk = new FakeDisk();
		const cache = new ViewCache({ disk, maxEntries: 2 });

		cache.store('a', { id: 'a' });
		cache.store('b', { id: 'b' });
		cache.store('c', { id: 'c' });

		expect(cache.get('a')).toBeUndefined();
		expect(cache.get<Node>('b')).toEqual({ id: 'b' });
		expect(cache.get<Node>('c')).toEqual({ id: 'c' });
		// still recoverable from disk
		expect(await cache.load<Node>('a')).toEqual({ id: 'a' });
	});

	it('treats a read entry as recently used when choosing an eviction victim', () => {
		const cache = new ViewCache({ disk: new FakeDisk(), maxEntries: 2 });

		cache.store('a', { id: 'a' });
		cache.store('b', { id: 'b' });
		cache.get('a'); // promote a to most-recently-used
		cache.store('c', { id: 'c' }); // should evict b, not a

		expect(cache.get<Node>('a')).toEqual({ id: 'a' });
		expect(cache.get('b')).toBeUndefined();
		expect(cache.get<Node>('c')).toEqual({ id: 'c' });
	});

	it('returns undefined for a corrupt disk blob instead of throwing', async () => {
		const disk = new FakeDisk();
		new ViewCache({ disk, maxEntries: 8 }).store('album:al1', albums[0]);
		const [storedKey] = [...disk.values.keys()];
		disk.values.set(storedKey, 'not json {');

		expect(await new ViewCache({ disk, maxEntries: 8 }).load('album:al1')).toBeUndefined();
	});

	it('does not read blobs written under a different cache version', async () => {
		const disk = new FakeDisk();
		// simulate a payload persisted by an older app version (previous version prefix)
		disk.values.set('v0:album:al1', JSON.stringify(albums[0]));

		expect(await new ViewCache({ disk, maxEntries: 8 }).load('album:al1')).toBeUndefined();
	});

	it('invalidate clears both the memory and disk tiers', async () => {
		const disk = new FakeDisk();
		const cache = new ViewCache({ disk, maxEntries: 8 });
		cache.store('album:al1', albums[0]);

		cache.invalidate('album:al1');

		expect(cache.get('album:al1')).toBeUndefined();
		expect(await cache.load('album:al1')).toBeUndefined();
	});
});

class FakeDisk implements ViewCacheDiskStore {
	readonly values = new Map<string, string>();
	readonly weights = new Map<string, number | undefined>();

	fetchString(key: string): Promise<string> {
		const value = this.values.get(key);
		if (value == null) {
			return Promise.reject(new Error('missing key'));
		}
		return Promise.resolve(value);
	}

	remove(key: string): Promise<void> {
		this.values.delete(key);
		return Promise.resolve();
	}

	storeString(key: string, value: string, _ttlSeconds?: number, weight?: number): Promise<void> {
		this.values.set(key, value);
		this.weights.set(key, weight);
		return Promise.resolve();
	}
}
