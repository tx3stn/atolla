import 'jasmine/src/jasmine';
import { type ConnectionMode, ConnectionModes } from 'atolla_app/src/models/App';
import { ViewCache, type ViewCacheDiskStore } from 'atolla_app/src/services/ViewCache';

const albums = [{ artistId: 'a1', artistName: 'Converge', id: 'al1', name: 'Jane Doe' }];
type AlbumRow = (typeof albums)[number];
type Node = { id: string };

describe('ViewCache', () => {
	it('get misses before a store and hits synchronously after', () => {
		const cache = makeCache(new FakeDisk(), 8);

		expect(cache.get('list:albums')).toBeUndefined();

		cache.store('list:albums', albums);

		expect(cache.get<typeof albums>('list:albums')).toEqual(albums);
	});

	it('persists to disk and hydrates a fresh cache via load', async () => {
		const disk = new FakeDisk();
		makeCache(disk, 8).store('album:al1', albums[0]);

		const fresh = makeCache(disk, 8);
		expect(fresh.get('album:al1')).toBeUndefined();

		expect(await fresh.load<AlbumRow>('album:al1')).toEqual(albums[0]);
		// load hydrated memory, so a subsequent sync get now hits
		expect(fresh.get<AlbumRow>('album:al1')).toEqual(albums[0]);
	});

	it('forwards the serialized byte weight to the disk store for LRU accounting', () => {
		const disk = new FakeDisk();
		const cache = makeCache(disk, 8);

		cache.store('album:al1', albums[0]);

		const [storedKey] = [...disk.values.keys()];
		expect(disk.weights.get(storedKey)).toBe(disk.values.get(storedKey)?.length);
	});

	it('evicts the least-recently-used entry from memory past maxEntries but keeps it on disk', async () => {
		const disk = new FakeDisk();
		const cache = makeCache(disk, 2);

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
		const cache = makeCache(new FakeDisk(), 2);

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
		makeCache(disk, 8).store('album:al1', albums[0]);
		const [storedKey] = [...disk.values.keys()];
		disk.values.set(storedKey, 'not json {');

		expect(await makeCache(disk, 8).load('album:al1')).toBeUndefined();
	});

	it('does not read blobs written under a different cache version', async () => {
		const disk = new FakeDisk();
		// simulate a payload persisted by an older app version (previous version prefix)
		disk.values.set('v0:album:al1', JSON.stringify(albums[0]));

		expect(await makeCache(disk, 8).load('album:al1')).toBeUndefined();
	});

	it('invalidate clears both the memory and disk tiers', async () => {
		const disk = new FakeDisk();
		const cache = makeCache(disk, 8);
		cache.store('album:al1', albums[0]);

		cache.invalidate('album:al1');

		expect(cache.get('album:al1')).toBeUndefined();
		expect(await cache.load('album:al1')).toBeUndefined();
	});

	it('stores nothing in either tier while offline', async () => {
		const disk = new FakeDisk();
		const cache = makeCache(disk, 8, ConnectionModes.offline);

		cache.store('list:albums:all', albums);

		expect(cache.get('list:albums:all')).toBeUndefined();
		expect(disk.values.size).toBe(0);
		expect(await cache.load('list:albums:all')).toBeUndefined();
	});

	it('does not serve an offline view the wider library cached while online', async () => {
		const disk = new FakeDisk();
		let mode: ConnectionMode = ConnectionModes.online;
		const cache = new ViewCache({ connectionMode: () => mode, disk, maxEntries: 8 });
		cache.store('album:al1', albums[0]);

		mode = ConnectionModes.offline;

		expect(cache.get('album:al1')).toBeUndefined();
		expect(await cache.load('album:al1')).toBeUndefined();
	});

	it('keeps the online payload when an offline view refreshes the same key', async () => {
		const disk = new FakeDisk();
		let mode: ConnectionMode = ConnectionModes.online;
		const cache = new ViewCache({ connectionMode: () => mode, disk, maxEntries: 8 });
		cache.store('album:al1', albums[0]);

		mode = ConnectionModes.offline;
		cache.invalidate('album:al1');
		mode = ConnectionModes.online;

		expect(cache.get<AlbumRow>('album:al1')).toEqual(albums[0]);
		expect(await makeCache(disk, 8).load<AlbumRow>('album:al1')).toEqual(albums[0]);
	});

	it('keeps the online payload when an offline view re-stores the same key', async () => {
		const disk = new FakeDisk();
		let mode: ConnectionMode = ConnectionModes.online;
		const cache = new ViewCache({ connectionMode: () => mode, disk, maxEntries: 8 });
		cache.store('album:al1', albums[0]);

		mode = ConnectionModes.offline;
		cache.store('album:al1', { ...albums[0], name: 'only the downloaded tracks' });
		mode = ConnectionModes.online;

		expect(cache.get<AlbumRow>('album:al1')).toEqual(albums[0]);
		expect(await makeCache(disk, 8).load<AlbumRow>('album:al1')).toEqual(albums[0]);
	});
});

function makeCache(
	disk: ViewCacheDiskStore,
	maxEntries: number,
	connectionMode: ConnectionMode = ConnectionModes.online,
): ViewCache {
	return new ViewCache({ connectionMode: () => connectionMode, disk, maxEntries });
}

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
