import 'jasmine/src/jasmine';
import type { Album } from 'atolla/src/models/Album';
import type { Track } from 'atolla/src/models/Track';
import type { ImageCache } from 'atolla/src/services/ImageCache';
import type { OnThisDayService } from 'atolla/src/services/OnThisDayService';
import type { RecentlyAddedService } from 'atolla/src/services/RecentlyAddedService';
import type { ToastService } from 'atolla/src/services/ToastService';
import type { PlaybackStore } from 'atolla/src/stores/Playback';
import { Preferences } from 'atolla/src/stores/Preferences';
import { ConnectionModes } from 'atolla/src/transports/Model';
import type { Transport } from 'atolla/src/transports/Transport';
import { HomeView, type HomeViewModel } from 'atolla/src/ui/views/HomeView';
import { InstrumentedComponentJSX } from 'valdi_test/test/JSXTestUtils';

async function flushAsyncWork(): Promise<void> {
	for (let i = 0; i < 20; i += 1) {
		await Promise.resolve();
	}
}

function makeOnThisDayService() {
	const calls = { ensureLoaded: 0, getAlbumsForDate: 0, refresh: 0 };
	const albums: Array<Album> = [
		{ artistId: 'ar1', artistName: 'Artist', id: 'a1', name: 'Album One' },
	];
	const service = {
		ensureLoaded: async () => {
			calls.ensureLoaded += 1;
		},
		getAlbumsForDate: () => {
			calls.getAlbumsForDate += 1;
			return albums;
		},
		refresh: async () => {
			calls.refresh += 1;
			return { error: undefined };
		},
	} as unknown as OnThisDayService;
	return { calls, service };
}

function makeRecentlyAddedService() {
	const calls = { loadCached: 0, refresh: 0 };
	const albums: Array<Album> = [
		{ artistId: 'ar1', artistName: 'Artist', id: 'r1', name: 'Recent' },
	];
	const service = {
		loadCached: async () => {
			calls.loadCached += 1;
			return [];
		},
		refresh: async () => {
			calls.refresh += 1;
			return albums;
		},
	} as unknown as RecentlyAddedService;
	return { calls, service };
}

function makeBaseDeps() {
	return {
		connectionMode: ConnectionModes.online,
		imageCache: {} as ImageCache,
		onOpenAlbum: () => {},
		playbackStore: { subscribe: () => () => {} } as unknown as PlaybackStore,
		preferences: new Preferences({ fetchString: async () => '', storeString: async () => {} }),
		toastService: { show: () => {}, subscribe: () => () => {} } as unknown as ToastService,
		transport: {} as Transport,
	};
}

function buildViewModel(
	base: ReturnType<typeof makeBaseDeps>,
	onThisDayService: OnThisDayService | undefined,
	recentlyAddedService: RecentlyAddedService | undefined,
	recentlyPlayedTracks: Array<Track> = [],
): HomeViewModel {
	return { ...base, onThisDayService, recentlyAddedService, recentlyPlayedTracks };
}

describe('HomeView', () => {
	it('loads on-this-day and recently-added once the services become available after mount', async () => {
		const base = makeBaseDeps();
		const onThisDay = makeOnThisDayService();
		const recentlyAdded = makeRecentlyAddedService();
		const instrumented = InstrumentedComponentJSX.create(
			HomeView,
			buildViewModel(base, undefined, undefined),
			undefined,
		);

		await flushAsyncWork();
		expect(onThisDay.calls.ensureLoaded).toBe(0);
		expect(recentlyAdded.calls.refresh).toBe(0);

		instrumented.setViewModel(buildViewModel(base, onThisDay.service, recentlyAdded.service));
		await flushAsyncWork();

		expect(onThisDay.calls.ensureLoaded).toBe(1);
		expect(recentlyAdded.calls.loadCached).toBe(1);
		expect(recentlyAdded.calls.refresh).toBe(1);
	});

	it('does not reload when an unrelated view-model update leaves the services unchanged', async () => {
		const base = makeBaseDeps();
		const onThisDay = makeOnThisDayService();
		const recentlyAdded = makeRecentlyAddedService();
		const instrumented = InstrumentedComponentJSX.create(
			HomeView,
			buildViewModel(base, onThisDay.service, recentlyAdded.service),
			undefined,
		);

		await flushAsyncWork();
		expect(onThisDay.calls.ensureLoaded).toBe(1);

		const track = { albumName: 'A', artistName: 'B', id: 't1', name: 'Song' } as unknown as Track;
		instrumented.setViewModel(
			buildViewModel(base, onThisDay.service, recentlyAdded.service, [track]),
		);
		await flushAsyncWork();

		expect(onThisDay.calls.ensureLoaded).toBe(1);
	});
});
