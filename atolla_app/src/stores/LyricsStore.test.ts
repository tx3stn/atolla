import { describe, expect, it } from 'bun:test';
import type { Lyrics } from 'atolla_core/src/models/Lyrics';
import { type LyricsBackingStore, LyricsStore } from './LyricsStore';

function createBackingStore(initial: Record<string, string> = {}) {
	const values = new Map<string, string>(Object.entries(initial));
	const store: LyricsBackingStore = {
		fetchAll: () => Promise.resolve(Object.fromEntries(values)),
		fetchString: (key) => {
			const value = values.get(key);
			return value == null ? Promise.reject(new Error('missing key')) : Promise.resolve(value);
		},
		removeAll: () => {
			values.clear();
			return Promise.resolve();
		},
		storeString: (key, value) => {
			values.set(key, value);
			return Promise.resolve();
		},
	};

	return { store, values };
}

const lyrics: Lyrics = {
	lines: [{ startSeconds: 1.5, text: 'a line' }],
	synced: true,
};

describe('LyricsStore', () => {
	it('round-trips lyrics under a versioned key', async () => {
		const { store, values } = createBackingStore();
		const lyricsStore = new LyricsStore(store);

		await lyricsStore.saveLyrics('track-1', lyrics);

		expect([...values.keys()]).toEqual(['v1:track-1']);
		expect(await lyricsStore.loadLyrics('track-1')).toEqual(lyrics);
	});

	it('distinguishes a track with no lyrics from one that was never cached', async () => {
		const { store } = createBackingStore();
		const lyricsStore = new LyricsStore(store);

		await lyricsStore.saveLyrics('track-1', null);

		expect(await lyricsStore.loadLyrics('track-1')).toBeNull();
		expect(await lyricsStore.loadLyrics('track-2')).toBeUndefined();
	});

	it('treats a corrupt blob as uncached rather than throwing', async () => {
		const { store } = createBackingStore({ 'v1:track-1': '{not json' });

		expect(await new LyricsStore(store).loadLyrics('track-1')).toBeUndefined();
	});

	it('treats a blob of the wrong shape as uncached', async () => {
		const { store } = createBackingStore({ 'v1:track-1': '{"lines":"nope"}' });

		expect(await new LyricsStore(store).loadLyrics('track-1')).toBeUndefined();
	});

	it('ignores entries written under an older cache version', async () => {
		const { store } = createBackingStore({ 'v0:track-1': JSON.stringify(lyrics) });

		expect(await new LyricsStore(store).loadLyrics('track-1')).toBeUndefined();
	});

	it('drops every entry on clear', async () => {
		const { store, values } = createBackingStore();
		const lyricsStore = new LyricsStore(store);
		await lyricsStore.saveLyrics('track-1', lyrics);

		await lyricsStore.clearAll();

		expect(values.size).toBe(0);
	});

	it('counts cached entries from an object property list', async () => {
		const { store } = createBackingStore({ 'v1:track-1': 'x', 'v1:track-2': 'y' });

		expect(await new LyricsStore(store).count()).toBe(2);
	});

	it('counts cached entries from a flat key/value property list', async () => {
		const { store } = createBackingStore();
		store.fetchAll = () => Promise.resolve(['v1:track-1', 'x', 'v1:track-2', 'y']);

		expect(await new LyricsStore(store).count()).toBe(2);
	});

	it('reports no cached entries when the backing store fails', async () => {
		const { store } = createBackingStore();
		store.fetchAll = () => Promise.reject(new Error('unavailable'));

		expect(await new LyricsStore(store).count()).toBe(0);
	});
});
