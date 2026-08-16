import { describe, expect, it } from 'bun:test';
import type { Track } from '../models/Track';
import { InMemoryKeyValueStore } from './KeyValueStore';
import { RECENTLY_PLAYED_KEY, RECENTLY_PLAYED_LIMIT, RecentlyPlayedStore } from './RecentlyPlayed';

describe('RecentlyPlayedStore', () => {
	it('returns an empty list when nothing is persisted', async () => {
		const store = new RecentlyPlayedStore(new InMemoryKeyValueStore());
		expect(await store.load()).toEqual([]);
	});

	it('round-trips saved tracks', async () => {
		const store = new RecentlyPlayedStore(new InMemoryKeyValueStore());
		await store.save([makeTrack('a'), makeTrack('b')]);
		expect((await store.load()).map((t) => t.id)).toEqual(['a', 'b']);
	});

	it('caps saved tracks at the limit', async () => {
		const store = new RecentlyPlayedStore(new InMemoryKeyValueStore());
		await store.save(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(makeTrack));
		expect((await store.load()).length).toEqual(RECENTLY_PLAYED_LIMIT);
	});

	it('drops malformed entries on load', async () => {
		const persistence = new InMemoryKeyValueStore();
		await persistence.storeString(
			RECENTLY_PLAYED_KEY,
			JSON.stringify([makeTrack('a'), { id: 'no-name' }, 'garbage', makeTrack('b')]),
		);
		const store = new RecentlyPlayedStore(persistence);
		expect((await store.load()).map((t) => t.id)).toEqual(['a', 'b']);
	});

	it('returns an empty list when the persisted blob is not an array', async () => {
		const persistence = new InMemoryKeyValueStore();
		await persistence.storeString(RECENTLY_PLAYED_KEY, JSON.stringify({ not: 'an array' }));
		const store = new RecentlyPlayedStore(persistence);
		expect(await store.load()).toEqual([]);
	});

	it('exposes the raw persisted blob for diagnostics', async () => {
		const store = new RecentlyPlayedStore(new InMemoryKeyValueStore());
		expect(await store.loadRaw()).toBeUndefined();
		await store.save([makeTrack('a')]);
		expect(await store.loadRaw()).toContain('"id":"a"');
	});
});

function makeTrack(id: string): Track {
	return { duration: 100, id, name: `Track ${id}` } as Track;
}
