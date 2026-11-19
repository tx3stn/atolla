import 'jasmine/src/jasmine';
import { LidarrClient } from 'atolla_app/src/integrations/lidarr/Client';
import { LidarrConnection } from 'atolla_app/src/integrations/lidarr/Connection';
import type { LidarrAlbum } from 'atolla_app/src/integrations/lidarr/Models';
import { UpcomingService } from 'atolla_app/src/integrations/lidarr/UpcomingService';
import { ConnectionModes } from 'atolla_app/src/models/App';
import Strings from 'atolla_app/src/Strings';
import type { LyricsService } from 'atolla_app/src/services/LyricsService';
import type { OnThisDayService } from 'atolla_app/src/services/OnThisDayService';
import type { RecentlyAddedService } from 'atolla_app/src/services/RecentlyAddedService';
import type { ToastService } from 'atolla_app/src/services/ToastService';
import { Preferences } from 'atolla_app/src/stores/Preferences';
import { HomeView, type HomeViewModel } from 'atolla_app/src/ui/views/HomeView';
import type { Album } from 'atolla_core/src/models/Album';
import type { Track } from 'atolla_core/src/models/Track';
import { InMemoryKeyValueStore } from 'atolla_core/src/stores/KeyValueStore';
import type { Transport } from 'atolla_core/src/transports/Transport';
import type { PlaybackStore } from 'atolla_player/src/stores/Playback';
import type { HttpTransport } from 'atolla_sync/src/api/Transport';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { Component } from 'valdi_core/src/Component';
import { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { DetachedSlotRenderer } from 'valdi_core/src/slot/DetachedSlotRenderer';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import {
	type IComponentTestDriver,
	InstrumentedComponentJSX,
	valdiIt,
} from 'valdi_test/test/JSXTestUtils';
import { touchEvent, touchEventWith } from '../util/testEvents';

// wrapper that renders the home view alongside a DetachedSlotRenderer so the slot-rendered context
// menu appears in the same component tree as the view
class HomeViewWithSlot extends Component<HomeViewModel> {
	private slot = new DetachedSlot();

	onRender() {
		<view>
			<HomeView {...this.viewModel} modalSlot={this.slot} />
			<DetachedSlotRenderer detachedSlot={this.slot} />
		</view>;
	}
}

async function flushAsyncWork(): Promise<void> {
	for (let i = 0; i < 20; i += 1) {
		await Promise.resolve();
	}
}

function makeOnThisDayService() {
	const calls = {
		ensureLoaded: 0,
		getAlbumsForDate: 0,
		lookaheadDays: [] as Array<number>,
		refresh: 0,
	};
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
		getCachedAlbums: () => albums,
		refresh: async (
			_transport: unknown,
			_now: Date,
			options: { force?: boolean; lookaheadDays: number },
		) => {
			calls.refresh += 1;
			calls.lookaheadDays.push(options.lookaheadDays);
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
	const { lidarr, upcoming } = unconnectedLidarr([]);
	return {
		connectionMode: ConnectionModes.online,
		lidarr,
		lyricsService: {} as LyricsService,
		onOpenAlbum: () => {},
		playbackStore: { subscribe: () => () => {} } as unknown as PlaybackStore,
		preferences: new Preferences({ fetchString: async () => '', storeString: async () => {} }),
		toastService: { show: () => {}, subscribe: () => () => {} } as unknown as ToastService,
		transport: {} as Transport,
		upcoming,
	};
}

function findByLabel(component: unknown, label: string) {
	return elementTypeFind(
		componentGetElements(component as never),
		IRenderedElementViewClass.View,
	).find((view) => view.getAttribute('accessibilityLabel') === label);
}

async function renderHomeForPlaylistFlow(driver: IComponentTestDriver) {
	const base = makeBaseDeps();
	base.playbackStore = { subscribe: () => () => {} } as unknown as PlaybackStore;
	base.transport = {
		getArtistLogoUrl: () => Promise.resolve(null),
		getPlaylists: () => Promise.resolve({ hasMore: false, items: [] }),
		getTracksByAlbum: () => Promise.resolve([{ duration: 180, id: 't1', name: 'Track' }]),
		peekArtistLogoUrl: () => undefined,
	} as unknown as Transport;
	await base.preferences.setAnimationsEnabled(false);

	const component = driver.renderComponent(
		HomeViewWithSlot,
		buildViewModel(base, undefined, makeRecentlyAddedService().service),
		undefined,
	);
	await flushAsyncWork();
	return component;
}

async function longPressAndTap(
	component: unknown,
	headerLabel: string,
	actionLabel: string,
): Promise<void> {
	findByLabel(component, headerLabel)?.getAttribute('onLongPress')?.(touchEvent);
	await flushAsyncWork();
	findByLabel(component, actionLabel)?.getAttribute('onTap')?.(touchEvent);
	await flushAsyncWork();
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

	it('refreshes on-this-day with the configured lookahead, and again when it changes', async () => {
		const base = makeBaseDeps();
		const onThisDay = makeOnThisDayService();
		await base.preferences.setOnThisDayLookaheadDays(7);
		InstrumentedComponentJSX.create(
			HomeView,
			buildViewModel(base, onThisDay.service, undefined),
			undefined,
		);
		await flushAsyncWork();

		expect(onThisDay.calls.lookaheadDays).toEqual([7]);

		await base.preferences.setOnThisDayLookaheadDays(14);
		await flushAsyncWork();

		expect(onThisDay.calls.lookaheadDays).toEqual([7, 14]);
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

	valdiIt('addresses recently played artwork by album id', async (driver) => {
		const track = {
			albumId: 'album-1',
			albumImageUrl: 'https://album.png',
			duration: 180,
			id: 't1',
			name: 'Song',
		};
		const component = driver.renderComponent(
			HomeView,
			buildViewModel(makeBaseDeps(), undefined, undefined, [track]),
			undefined,
		);
		await flushAsyncWork();

		const sources = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Image,
		).map((image) => image.getAttribute('src'));

		expect(
			sources.some(
				(src) => typeof src === 'string' && src.includes('c=album_art_thumb&id=album-1'),
			),
		).toBe(true);
	});

	// the context menu toasts through the service this view hands it, so a queue action taken from
	// home surfaces the same confirmation the library grids do
	valdiIt('surfaces the add-to-queue toast from a recently-added card', async (driver) => {
		const toasts: Array<string> = [];
		const base = makeBaseDeps();
		base.toastService = {
			show: (toast: { message: string; variant: string }) => {
				toasts.push(`${toast.variant}:${toast.message}`);
			},
			subscribe: () => () => {},
		} as unknown as ToastService;
		base.playbackStore = {
			addToQueue: () => {},
			subscribe: () => () => {},
		} as unknown as PlaybackStore;
		base.transport = {
			getArtistLogoUrl: () => Promise.resolve(null),
			getTracksByAlbum: () => Promise.resolve([{ duration: 180, id: 't1', name: 'Track' }]),
			peekArtistLogoUrl: () => undefined,
		} as unknown as Transport;
		await base.preferences.setAnimationsEnabled(false);

		const recentlyAdded = makeRecentlyAddedService();
		const component = driver.renderComponent(
			HomeViewWithSlot,
			buildViewModel(base, undefined, recentlyAdded.service),
			undefined,
		);
		await flushAsyncWork();

		jasmine.clock().install();
		try {
			const card = elementTypeFind(
				componentGetElements(component),
				IRenderedElementViewClass.View,
			).find((view) => view.getAttribute('accessibilityLabel') === 'card-r1');
			card?.getAttribute('onTouch')?.(touchEventWith({ state: 0 }));
			jasmine.clock().tick(500);
		} finally {
			jasmine.clock().uninstall();
		}

		const addToQueue = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.View,
		).find((view) => view.getAttribute('accessibilityLabel') === 'card-context-add-to-queue');
		addToQueue?.getAttribute('onTap')?.(touchEvent);
		await flushAsyncWork();

		expect(toasts).toEqual(['success:added to queue']);
	});

	valdiIt('queues every recently-added item from the section header', async (driver) => {
		const queued: Array<Array<string>> = [];
		const base = makeBaseDeps();
		base.playbackStore = {
			addToQueue: (tracks: Array<Track>) => {
				queued.push(tracks.map((track) => track.id));
			},
			subscribe: () => () => {},
		} as unknown as PlaybackStore;
		base.transport = {
			getArtistLogoUrl: () => Promise.resolve(null),
			getTracksByAlbum: (albumId: string) =>
				Promise.resolve([{ duration: 180, id: `${albumId}-t1`, name: 'Track' }]),
			peekArtistLogoUrl: () => undefined,
		} as unknown as Transport;
		await base.preferences.setAnimationsEnabled(false);

		const recentlyAdded = makeRecentlyAddedService();
		const component = driver.renderComponent(
			HomeViewWithSlot,
			buildViewModel(base, undefined, recentlyAdded.service),
			undefined,
		);
		await flushAsyncWork();

		const header = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.View,
		).find((view) => view.getAttribute('accessibilityLabel') === 'home-section-recently-added');
		header?.getAttribute('onLongPress')?.(touchEvent);
		await flushAsyncWork();

		const addToQueue = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.View,
		).find((view) => view.getAttribute('accessibilityLabel') === 'home-context-add-to-queue');
		addToQueue?.getAttribute('onTap')?.(touchEvent);
		await flushAsyncWork();

		expect(queued).toEqual([['r1-t1']]);
	});

	valdiIt('plays the on-this-day section oldest release first', async (driver) => {
		const now = new Date();
		const anniversary = (year: number): string =>
			`${year}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T00:00:00.000Z`;
		const albums: Array<Album> = [
			{
				artistId: 'ar1',
				artistName: 'Artist',
				id: 'newer',
				name: 'Newer',
				releaseDate: anniversary(2010),
			},
			{
				artistId: 'ar1',
				artistName: 'Artist',
				id: 'older',
				name: 'Older',
				releaseDate: anniversary(1990),
			},
		];

		const played: Array<Array<string>> = [];
		const base = makeBaseDeps();
		base.playbackStore = {
			playTracks: (tracks: Array<Track>) => {
				played.push(tracks.map((track) => track.id));
			},
			setQueueFiller: () => {},
			subscribe: () => () => {},
			trackIndex: 0,
			tracks: [],
		} as unknown as PlaybackStore;
		base.transport = {
			getArtistLogoUrl: () => Promise.resolve(null),
			getTracksByAlbum: (albumId: string) =>
				Promise.resolve([{ duration: 180, id: `${albumId}-t1`, name: 'Track' }]),
			peekArtistLogoUrl: () => undefined,
		} as unknown as Transport;
		await base.preferences.setAnimationsEnabled(false);

		const onThisDay = makeOnThisDayService();
		(onThisDay.service as unknown as { getAlbumsForDate: () => Array<Album> }).getAlbumsForDate =
			() => albums;

		const component = driver.renderComponent(
			HomeViewWithSlot,
			buildViewModel(base, onThisDay.service, undefined),
			undefined,
		);
		await flushAsyncWork();

		const header = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.View,
		).find((view) => view.getAttribute('accessibilityLabel') === 'home-section-on-this-day');
		header?.getAttribute('onLongPress')?.(touchEvent);
		await flushAsyncWork();

		const play = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.View,
		).find((view) => view.getAttribute('accessibilityLabel') === 'home-context-play');
		play?.getAttribute('onTap')?.(touchEvent);
		await flushAsyncWork();

		expect(played).toEqual([['older-t1']]);
	});

	valdiIt('opens add-to-playlist from the section header', async (driver) => {
		const component = await renderHomeForPlaylistFlow(driver);

		await longPressAndTap(component, 'home-section-recently-added', 'home-context-add-to-playlist');

		expect(findByLabel(component, 'add-to-playlist-view')).not.toBeUndefined();
	});

	valdiIt('opens create-playlist from the section header', async (driver) => {
		const component = await renderHomeForPlaylistFlow(driver);

		await longPressAndTap(component, 'home-section-recently-added', 'home-context-create-playlist');

		expect(findByLabel(component, 'create-playlist-create-btn')).not.toBeUndefined();
	});

	valdiIt('opens add-to-playlist from a card', async (driver) => {
		const component = await renderHomeForPlaylistFlow(driver);

		jasmine.clock().install();
		try {
			findByLabel(component, 'card-r1')?.getAttribute('onTouch')?.(touchEventWith({ state: 0 }));
			jasmine.clock().tick(500);
		} finally {
			jasmine.clock().uninstall();
		}
		findByLabel(component, 'card-context-add-to-playlist')?.getAttribute('onTap')?.(touchEvent);
		await flushAsyncWork();

		expect(findByLabel(component, 'add-to-playlist-view')).not.toBeUndefined();
	});

	valdiIt('opens no section menu when the section is empty', async (driver) => {
		const base = makeBaseDeps();
		await base.preferences.setAnimationsEnabled(false);

		const component = driver.renderComponent(
			HomeViewWithSlot,
			buildViewModel(base, undefined, undefined),
			undefined,
		);
		await flushAsyncWork();

		const header = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.View,
		).find((view) => view.getAttribute('accessibilityLabel') === 'home-section-pinned');
		header?.getAttribute('onLongPress')?.(touchEvent);
		await flushAsyncWork();

		const menu = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.View,
		).find((view) => view.getAttribute('accessibilityLabel') === 'home-context-menu');

		expect(menu).toBeUndefined();
	});
});

describe('HomeView upcoming', () => {
	valdiIt('shows no upcoming section while lidarr is not connected', async (driver) => {
		const component = driver.renderComponent(
			HomeView,
			buildViewModel(makeBaseDeps(), undefined, undefined),
			undefined,
		);
		await flushAsyncWork();

		expect(findByLabel(component, 'home-section-upcoming')).toBeUndefined();
	});

	valdiIt('says nothing is upcoming when lidarr has nothing coming', async (driver) => {
		const base = makeBaseDeps();
		const { lidarr, upcoming } = await connectedLidarr([]);

		const component = driver.renderComponent(
			HomeView,
			buildViewModel({ ...base, lidarr, upcoming }, undefined, undefined),
			undefined,
		);
		await flushAsyncWork();

		expect(labelValues(component)).toContain(Strings.homeNoUpcoming());
	});

	valdiIt('shows upcoming albums soonest first with their release dates', async (driver) => {
		const base = makeBaseDeps();
		const { lidarr, upcoming } = await connectedLidarr([
			lidarrAlbum({ id: 1, releaseDate: '2099-03-01T00:00:00Z', title: 'Jane Doe' }),
			lidarrAlbum({ id: 2, releaseDate: '2099-01-15T00:00:00Z', title: 'Axe to Fall' }),
		]);

		const component = driver.renderComponent(
			HomeView,
			buildViewModel({ ...base, lidarr, upcoming }, undefined, undefined),
			undefined,
		);
		await flushAsyncWork();

		expect(upcomingCardIds(component)).toEqual(['card-detail-lidarr-2', 'card-detail-lidarr-1']);
		expect(labelValues(component)).toContain(Strings.dateDayMonth('15th', Strings.monthJanuary()));
	});

	valdiIt('writes the release day in the chosen language', async (driver) => {
		const base = makeBaseDeps();
		const { lidarr, upcoming } = await connectedLidarr([lidarrAlbum({ id: 1 })]);
		const component = driver.renderComponent(
			HomeView,
			buildViewModel({ ...base, lidarr, upcoming }, undefined, undefined),
			undefined,
		);
		await flushAsyncWork();

		await base.preferences.setLanguage('fr');
		await flushAsyncWork();

		expect(labelValues(component)).toContain(Strings.dateDayMonth('15', Strings.monthJanuary()));
	});

	valdiIt('shows only as many upcoming albums as chosen, soonest first', async (driver) => {
		const base = makeBaseDeps();
		await base.preferences.setUpcomingLimit(3);
		const { lidarr, upcoming } = await connectedLidarr(fourReleases());

		const component = driver.renderComponent(
			HomeView,
			buildViewModel({ ...base, lidarr, upcoming }, undefined, undefined),
			undefined,
		);
		await flushAsyncWork();

		expect(upcomingCardIds(component)).toEqual([
			'card-detail-lidarr-1',
			'card-detail-lidarr-2',
			'card-detail-lidarr-3',
		]);
	});

	valdiIt('shows more upcoming albums once the limit is raised', async (driver) => {
		const base = makeBaseDeps();
		await base.preferences.setUpcomingLimit(3);
		const { lidarr, upcoming } = await connectedLidarr(fourReleases());
		const component = driver.renderComponent(
			HomeView,
			buildViewModel({ ...base, lidarr, upcoming }, undefined, undefined),
			undefined,
		);
		await flushAsyncWork();

		await base.preferences.setUpcomingLimit(5);
		await flushAsyncWork();

		expect(upcomingCardIds(component).length).toBe(4);
	});

	valdiIt('shows the saved list without asking lidarr while offline', async (driver) => {
		const base = makeBaseDeps();
		const { calendarCalls, lidarr, upcoming } = await connectedLidarr([lidarrAlbum({ id: 1 })]);
		const client = lidarr.client();
		if (client === null) {
			throw new Error('lidarr should be connected');
		}
		await upcoming.refresh(client, new Date());

		const component = driver.renderComponent(
			HomeView,
			{
				...buildViewModel({ ...base, lidarr, upcoming }, undefined, undefined),
				connectionMode: ConnectionModes.offline,
			},
			undefined,
		);
		await flushAsyncWork();

		expect(calendarCalls.count).toBe(1);
		expect(upcomingCardIds(component)).toEqual(['card-detail-lidarr-1']);
	});

	valdiIt('shows the section once lidarr is connected', async (driver) => {
		const base = makeBaseDeps();
		const { lidarr, upcoming } = unconnectedLidarr([lidarrAlbum({ id: 1 })]);
		const component = driver.renderComponent(
			HomeView,
			buildViewModel({ ...base, lidarr, upcoming }, undefined, undefined),
			undefined,
		);
		await flushAsyncWork();

		await lidarr.connect('http://lidarr.local:8686', 'key-1');
		await flushAsyncWork();

		expect(upcomingCardIds(component)).toEqual(['card-detail-lidarr-1']);
	});

	valdiIt('hides the section once lidarr is disconnected', async (driver) => {
		const base = makeBaseDeps();
		const { lidarr, upcoming } = await connectedLidarr([lidarrAlbum({ id: 1 })]);
		const component = driver.renderComponent(
			HomeView,
			buildViewModel({ ...base, lidarr, upcoming }, undefined, undefined),
			undefined,
		);
		await flushAsyncWork();
		expect(findByLabel(component, 'home-section-upcoming')).toBeDefined();

		await lidarr.disconnect();
		await flushAsyncWork();

		expect(findByLabel(component, 'home-section-upcoming')).toBeUndefined();
	});
});

function lidarrAlbum(overrides: Partial<LidarrAlbum> = {}): LidarrAlbum {
	return {
		artist: { artistName: 'Converge' },
		id: 1,
		images: [],
		releaseDate: '2099-01-15T00:00:00Z',
		title: 'Axe to Fall',
		...overrides,
	};
}

function fourReleases(): Array<LidarrAlbum> {
	return [
		lidarrAlbum({ id: 4, releaseDate: '2099-04-01T00:00:00Z' }),
		lidarrAlbum({ id: 2, releaseDate: '2099-02-01T00:00:00Z' }),
		lidarrAlbum({ id: 1, releaseDate: '2099-01-01T00:00:00Z' }),
		lidarrAlbum({ id: 3, releaseDate: '2099-03-01T00:00:00Z' }),
	];
}

function unconnectedLidarr(albums: Array<LidarrAlbum>) {
	const calendarCalls = { count: 0 };
	const transport: HttpTransport = {
		get: (url) => {
			const isCalendar = url.includes('/api/v1/calendar');
			if (isCalendar) {
				calendarCalls.count += 1;
			}
			const body = isCalendar ? JSON.stringify(albums) : '{"appName":"Lidarr"}';
			return Promise.resolve({
				body: new TextEncoder().encode(body),
				headers: {},
				statusCode: 200,
			});
		},
		post: () => Promise.reject(new Error('unused')),
		put: () => Promise.reject(new Error('unused')),
	};
	const upcoming = new UpcomingService(new InMemoryKeyValueStore());
	const lidarr = new LidarrConnection({
		createClient: (url, apiKey) => new LidarrClient(transport, url, apiKey),
		store: new InMemoryKeyValueStore(),
		upcoming,
	});

	return { calendarCalls, lidarr, upcoming };
}

async function connectedLidarr(albums: Array<LidarrAlbum>) {
	const unconnected = unconnectedLidarr(albums);
	await unconnected.lidarr.connect('http://lidarr.local:8686', 'key-1');

	return unconnected;
}

function labelValues(component: unknown): Array<unknown> {
	return elementTypeFind(
		componentGetElements(component as never),
		IRenderedElementViewClass.Label,
	).map((label) => label.getAttribute('value'));
}

function upcomingCardIds(component: unknown): Array<unknown> {
	return elementTypeFind(componentGetElements(component as never), IRenderedElementViewClass.View)
		.map((view) => view.getAttribute('accessibilityId'))
		.filter((id) => typeof id === 'string' && id.startsWith('card-detail-lidarr-'));
}
