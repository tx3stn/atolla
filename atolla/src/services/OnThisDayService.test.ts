import { describe, expect, it } from 'bun:test';
import type { Album } from '../models/Album';
import {
	DISCOVERY_PAGE_SIZE,
	localDateKey,
	OnThisDayService,
	type OnThisDayStore,
	type OnThisDayTransport,
} from './OnThisDayService';

const NOW = new Date(2024, 5, 15); // 15 June 2024, local
const TOMORROW_KEY = '2024-06-16';
const TODAY_KEY = '2024-06-15';

function album(id: string, releaseDate: string, name = `Album ${id}`): Album {
	return {
		artistId: `artist-${id}`,
		artistName: `Artist ${id}`,
		id,
		imageUrl: `http://img/${id}`,
		name,
		releaseDate,
	};
}

function memoryStore(seed?: string): OnThisDayStore & { value: () => string | undefined } {
	const data = new Map<string, string>();
	if (seed !== undefined) {
		data.set('on_this_day_v1', seed);
	}
	return {
		fetchString: (key) => Promise.resolve(data.get(key) ?? ''),
		storeString: (key, value) => {
			data.set(key, value);
			return Promise.resolve();
		},
		value: () => data.get('on_this_day_v1'),
	};
}

// a1 = today's anniversary, a2 = tomorrow's, a3 = wrong day, a4 = current year (no anniversary yet)
const library: Record<string, Album> = {
	a1: album('a1', '2001-06-15T12:00:00'),
	a2: album('a2', '2010-06-16T12:00:00'),
	a3: album('a3', '2005-07-01T12:00:00'),
	a4: album('a4', '2024-06-15T12:00:00'),
};

function transportFromPages(
	pages: Array<{ hasMore: boolean; items: Array<{ id: string; releaseDate?: string }> }>,
): OnThisDayTransport & { hydrateCalls: Array<Array<string>>; discoverCalls: number } {
	const state = { discoverCalls: 0, hydrateCalls: [] as Array<Array<string>> };
	return {
		get discoverCalls() {
			return state.discoverCalls;
		},
		getAlbumReleaseDatesPage: (page) => {
			state.discoverCalls += 1;
			return Promise.resolve(pages[page - 1] ?? { hasMore: false, items: [] });
		},
		getAlbumsByIds: (ids) => {
			state.hydrateCalls.push(ids);
			return Promise.resolve(ids.map((id) => library[id]).filter((a): a is Album => a != null));
		},
		get hydrateCalls() {
			return state.hydrateCalls;
		},
	};
}

function singlePageTransport() {
	return transportFromPages([
		{
			hasMore: false,
			items: Object.values(library).map((a) => ({ id: a.id, releaseDate: a.releaseDate })),
		},
	]);
}

describe('localDateKey', () => {
	it('formats a local YYYY-MM-DD key', () => {
		expect(localDateKey(NOW)).toBe(TODAY_KEY);
		expect(localDateKey(new Date(2024, 0, 5))).toBe('2024-01-05');
	});
});

describe('OnThisDayService.refresh', () => {
	it('discovers today/tomorrow matches, hydrates them, and caches both days', async () => {
		const transport = singlePageTransport();
		const store = memoryStore();
		const service = new OnThisDayService(store);

		await service.refresh(transport, NOW);

		expect(transport.hydrateCalls).toHaveLength(1);
		expect([...transport.hydrateCalls[0]].sort()).toEqual(['a1', 'a2']);

		expect(service.getAlbumsForDate(NOW).map((a) => a.id)).toEqual(['a1']);
		expect(service.getAlbumsForDate(new Date(2024, 5, 16)).map((a) => a.id)).toEqual(['a2']);
		expect(store.value()).toContain(TODAY_KEY);
		expect(store.value()).toContain(TOMORROW_KEY);
	});

	it('keeps sweeping past a full page even when hasMore is false (unreliable total)', async () => {
		// a full page with hasMore:false must not end the sweep: some Jellyfin configs
		// report TotalRecordCount as 0. anniversary album is on page 2
		const filler = Array.from({ length: DISCOVERY_PAGE_SIZE }, (_, i) => ({
			id: `filler-${i}`,
			releaseDate: '2000-01-01T12:00:00',
		}));
		const transport = transportFromPages([
			{ hasMore: false, items: filler },
			{ hasMore: false, items: [{ id: 'a1', releaseDate: library.a1.releaseDate }] },
		]);
		const service = new OnThisDayService(memoryStore());

		const summary = await service.refresh(transport, NOW);

		expect(transport.discoverCalls).toBe(2);
		expect(summary.scanned).toBe(DISCOVERY_PAGE_SIZE + 1);
		expect(service.getAlbumsForDate(NOW).map((a) => a.id)).toEqual(['a1']);
	});

	it('calls transport methods bound (class methods that use `this` must not lose it)', async () => {
		// mirrors LiveTransport: real transport methods reference `this`, so the
		// service must not invoke an extracted reference unbound
		class ClassTransport {
			pageSize = DISCOVERY_PAGE_SIZE;
			getAlbumReleaseDatesPage(page: number, _size: number) {
				void this.pageSize; // throws "Cannot read property 'pageSize' of undefined" if unbound
				return Promise.resolve({
					hasMore: false,
					items:
						page === 1
							? Object.values(library).map((a) => ({ id: a.id, releaseDate: a.releaseDate }))
							: [],
				});
			}
			getAlbumsByIds(ids: Array<string>) {
				void this.pageSize;
				return Promise.resolve(ids.map((id) => library[id]).filter((a): a is Album => a != null));
			}
		}

		const service = new OnThisDayService(memoryStore());
		const summary = await service.refresh(new ClassTransport(), NOW);

		expect(summary.error).toBeUndefined();
		expect(service.getAlbumsForDate(NOW).map((a) => a.id)).toEqual(['a1']);
	});

	it('reports a funnel summary so an empty result is diagnosable', async () => {
		const summary = await new OnThisDayService(memoryStore()).refresh(singlePageTransport(), NOW);

		expect(summary).toMatchObject({
			hydrated: 2,
			matched: 2,
			ran: true,
			today: 1,
			tomorrow: 1,
			withReleaseDate: 4,
		});
		expect(summary.scanned).toBe(4);
	});

	it('skips the sweep when the cache is already fresh, unless forced', async () => {
		const transport = singlePageTransport();
		const service = new OnThisDayService(memoryStore());

		await service.refresh(transport, NOW);
		const callsAfterFirst = transport.discoverCalls;

		await service.refresh(transport, NOW);
		expect(transport.discoverCalls).toBe(callsAfterFirst); // no extra sweep

		await service.refresh(transport, NOW, { force: true });
		expect(transport.discoverCalls).toBeGreaterThan(callsAfterFirst);
	});

	it('runs but stores an empty result when the transport returns no items', async () => {
		const store = memoryStore();
		const service = new OnThisDayService(store);

		const emptyTransport: OnThisDayTransport = {
			getAlbumReleaseDatesPage: () => Promise.resolve({ hasMore: false, items: [] }),
			getAlbumsByIds: () => Promise.resolve([]),
		};
		await service.refresh(emptyTransport, NOW);

		expect(store.value()).toBeDefined();
		expect(service.getAlbumsForDate(NOW)).toEqual([]);
	});

	it('never throws and keeps the prior cache when the transport fails', async () => {
		const service = new OnThisDayService(memoryStore());
		await service.refresh(singlePageTransport(), NOW); // seed a good cache

		const failing: OnThisDayTransport = {
			getAlbumReleaseDatesPage: () => Promise.reject(new Error('network down')),
			getAlbumsByIds: () => Promise.reject(new Error('network down')),
		};

		const summary = await service.refresh(failing, NOW, { force: true });
		expect(summary.error).toBeDefined();
		expect(service.getAlbumsForDate(NOW).map((a) => a.id)).toEqual(['a1']); // prior cache kept
	});
});

describe('OnThisDayService.getAlbumsForDate / load', () => {
	it('returns [] before anything is loaded or for an uncached date', async () => {
		const service = new OnThisDayService(memoryStore());
		expect(service.getAlbumsForDate(NOW)).toEqual([]);

		await service.refresh(singlePageTransport(), NOW);
		expect(service.getAlbumsForDate(new Date(2024, 6, 4))).toEqual([]);
	});

	it('restores a persisted cache and serves it (including the midnight rollover)', async () => {
		const store = memoryStore();
		await new OnThisDayService(store).refresh(singlePageTransport(), NOW);

		const restored = new OnThisDayService(store);
		await restored.load();

		expect(restored.getAlbumsForDate(NOW).map((a) => a.id)).toEqual(['a1']);
		// crossing midnight: the cached "tomorrow" now answers for the new today
		expect(restored.getAlbumsForDate(new Date(2024, 5, 16)).map((a) => a.id)).toEqual(['a2']);
	});

	it('ensureLoaded reads from disk only once', async () => {
		const store = memoryStore();
		await new OnThisDayService(store).refresh(singlePageTransport(), NOW);

		let reads = 0;
		const countingStore: OnThisDayStore = {
			fetchString: (key) => {
				reads += 1;
				return store.fetchString(key);
			},
			storeString: store.storeString,
		};
		const service = new OnThisDayService(countingStore);

		await Promise.all([service.ensureLoaded(), service.ensureLoaded()]);
		await service.ensureLoaded();

		expect(reads).toBe(1);
		expect(service.getAlbumsForDate(NOW).map((a) => a.id)).toEqual(['a1']);
	});

	it('drops malformed albums from a tampered cache instead of serving them', async () => {
		const tampered = JSON.stringify({
			today: {
				albums: [
					{ artistId: 'ar', artistName: 'A', id: 'ok', name: 'Good' },
					{ artistId: 'ar', artistName: 'A', id: 'bad', name: null },
				],
				date: TODAY_KEY,
			},
			tomorrow: { albums: [], date: TOMORROW_KEY },
			version: 2,
		});
		const service = new OnThisDayService(memoryStore(tampered));
		await service.load();

		expect(service.getAlbumsForDate(NOW).map((a) => a.id)).toEqual(['ok']);
	});

	it('discards a cache written by an older version', async () => {
		const old = JSON.stringify({
			today: {
				albums: [{ artistId: 'ar', artistName: 'A', id: 'ok', name: 'Good' }],
				date: TODAY_KEY,
			},
			tomorrow: { albums: [], date: TOMORROW_KEY },
			version: 1,
		});
		const service = new OnThisDayService(memoryStore(old));
		await service.load();

		expect(service.getAlbumsForDate(NOW)).toEqual([]);
	});
});
