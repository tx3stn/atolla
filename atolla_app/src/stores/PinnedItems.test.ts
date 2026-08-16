import { describe, expect, it } from 'bun:test';
import { InMemoryKeyValueStore } from 'atolla_core/src/stores/KeyValueStore';
import { PINNED_ITEMS_KEY, PinnedItemsStore } from './PinnedItems';

describe('PinnedItemsStore', () => {
	it('has nothing pinned by default', async () => {
		const store = new PinnedItemsStore(new InMemoryKeyValueStore());
		await store.ensureLoaded();
		expect(store.getAll()).toEqual([]);
		expect(store.isPinned('album', 'a')).toBe(false);
	});

	it('pins an item so it is pinned and appears in getAll', async () => {
		const store = new PinnedItemsStore(new InMemoryKeyValueStore(), () => 1);
		await store.ensureLoaded();

		await store.pin({ album: makeAlbum('a'), kind: 'album' });

		expect(store.isPinned('album', 'a')).toBe(true);
		expect(store.getAll()).toEqual([{ album: makeAlbum('a'), kind: 'album', pinnedAt: 1 }]);
	});

	it('unpins an item so it is no longer pinned', async () => {
		const store = new PinnedItemsStore(new InMemoryKeyValueStore());
		await store.ensureLoaded();
		await store.pin({ album: makeAlbum('a'), kind: 'album' });

		await store.unpin('album', 'a');

		expect(store.isPinned('album', 'a')).toBe(false);
		expect(store.getAll()).toEqual([]);
	});

	it('re-pinning the same kind and id upserts rather than duplicating', async () => {
		let now = 1;
		const store = new PinnedItemsStore(new InMemoryKeyValueStore(), () => now);
		await store.ensureLoaded();

		await store.pin({ album: makeAlbum('a'), kind: 'album' });
		now = 2;
		await store.pin({ album: { ...makeAlbum('a'), name: 'Renamed' }, kind: 'album' });

		const all = store.getAll();
		expect(all.length).toBe(1);
		expect(all[0]).toEqual({
			album: { ...makeAlbum('a'), name: 'Renamed' },
			kind: 'album',
			pinnedAt: 2,
		});
	});

	it('tracks the same id independently across different kinds', async () => {
		const store = new PinnedItemsStore(new InMemoryKeyValueStore());
		await store.ensureLoaded();

		await store.pin({ album: makeAlbum('x'), kind: 'album' });
		await store.pin({ artist: makeArtist('x'), kind: 'artist' });

		expect(store.isPinned('album', 'x')).toBe(true);
		expect(store.isPinned('artist', 'x')).toBe(true);
		expect(store.getAll().length).toBe(2);
	});

	it('orders getAll newest-pinned first', async () => {
		let now = 1;
		const store = new PinnedItemsStore(new InMemoryKeyValueStore(), () => now);
		await store.ensureLoaded();

		await store.pin({ album: makeAlbum('a'), kind: 'album' });
		now = 2;
		await store.pin({ artist: makeArtist('b'), kind: 'artist' });
		now = 3;
		await store.pin({ kind: 'playlist', playlist: makePlaylist('c') });

		expect(store.getAll().map((entry) => entry.pinnedAt)).toEqual([3, 2, 1]);
	});

	it('treats a malformed persisted blob as empty rather than throwing', async () => {
		const persistence = new InMemoryKeyValueStore();
		await persistence.storeString(PINNED_ITEMS_KEY, JSON.stringify({ not: 'the right shape' }));
		const store = new PinnedItemsStore(persistence);

		await expect(store.ensureLoaded()).resolves.toBeUndefined();
		expect(store.getAll()).toEqual([]);
	});

	it('round-trips pins through persistence for a fresh store instance', async () => {
		const persistence = new InMemoryKeyValueStore();
		const first = new PinnedItemsStore(persistence);
		await first.ensureLoaded();
		await first.pin({ genre: makeGenre('g'), kind: 'genre' });

		const second = new PinnedItemsStore(persistence);
		await second.ensureLoaded();

		expect(second.isPinned('genre', 'g')).toBe(true);
	});
});

function makeAlbum(id: string) {
	return { artistId: 'artist-1', artistName: 'Artist One', id, name: `Album ${id}` };
}

function makeArtist(id: string) {
	return { id, name: `Artist ${id}` };
}

function makeGenre(id: string) {
	return { id, name: `Genre ${id}` };
}

function makePlaylist(id: string) {
	return { id, name: `Playlist ${id}` };
}
