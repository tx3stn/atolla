import 'jasmine/src/jasmine';
import { type AppServicesBag, appServices } from 'atolla_app/src/services/AppServices';
import { Preferences } from 'atolla_app/src/stores/Preferences';
import { GenreView, type GenreViewModel } from 'atolla_app/src/ui/views/GenreView';
import { setTestAppServices } from 'atolla_app/test/util/appServices';
import { makeTestViewCache } from 'atolla_app/test/util/viewCache';
import { TRACK_PAGE_SIZE } from 'atolla_core/src/utils/Pagination';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { Component } from 'valdi_core/src/Component';
import { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { DetachedSlotRenderer } from 'valdi_core/src/slot/DetachedSlotRenderer';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';
import { touchEvent, touchEventWith } from '../util/testEvents';

class GenreViewWithSlot extends Component<GenreViewModel> {
	private slot = new DetachedSlot();

	onRender() {
		<view>
			<GenreView {...this.viewModel} modalSlot={this.slot} />
			<DetachedSlotRenderer detachedSlot={this.slot} />
		</view>;
	}
}

function findByLabel(component: unknown, label: string) {
	return elementTypeFind(
		componentGetElements(component as never),
		IRenderedElementViewClass.View,
	).find((view) => view.getAttribute('accessibilityLabel') === label);
}

// renders resume awaiting test bodies mid-render, so a fixed flush count can observe a
// half-built tree; poll for the element instead
async function waitForLabel(component: unknown, label: string): Promise<void> {
	for (let i = 0; i < 50 && !findByLabel(component, label); i += 1) {
		await Promise.resolve();
	}
}

function longPressArtwork(component: unknown): void {
	jasmine.clock().install();
	try {
		findByLabel(component, 'detail-header-artwork')?.getAttribute('onTouch')?.(
			touchEventWith({ state: 0 }),
		);
		jasmine.clock().tick(500);
	} finally {
		jasmine.clock().uninstall();
	}
}

const mockNavigator = {
	dismiss: () => {},
	forceDisableDismissalGesture: () => {},
	pop: () => {},
	popToRoot: () => {},
	popToSelf: () => {},
	presentComponent: () => {},
	pushComponent: () => {},
};

const downloadService = {
	getGenreDownloadState: () => 'not_downloaded',
	subscribe: () => () => {},
};

const playbackStore = {
	subscribe: () => () => {},
	track: null,
};

const networkStatus = { getTransport: () => 'wifi', subscribe: () => () => {} };

const preferences = new Preferences({ fetchString: async () => '', storeString: async () => {} });

async function flushAsyncWork() {
	for (let i = 0; i < 10; i += 1) {
		await Promise.resolve();
	}
}

const emptyTracksPage = async () => ({ hasMore: false, items: [], totalCount: 0 });

// track paging keys off the trigger becoming visible, so a layout pass is not the signal to send
function scrollLoadMoreTriggerIntoView(
	component: Parameters<typeof componentGetElements>[0],
): void {
	const trigger = elementTypeFind(
		componentGetElements(component),
		IRenderedElementViewClass.View,
	).find((view) => view.getAttribute('accessibilityLabel') === 'genre-load-more-trigger');
	trigger?.getAttribute('onVisibilityChanged')?.(true, 0);
}

describe('GenreView', () => {
	valdiIt('self-heals the header image when the genre has no imageUrl', async (driver) => {
		const genre = { id: 'genre-1', name: 'Rock' };
		let getGenreCalls = 0;
		const transport = {
			getGenre: async () => {
				getGenreCalls += 1;
				return { id: 'genre-1', imageUrl: 'https://g.png', name: 'Rock' };
			},
			getTracksByGenre: emptyTracksPage,
		};

		const component = driver.renderComponent(
			GenreView,
			{
				downloadService,
				genre,
				networkStatus,
				playbackStore,
				preferences,
				transport,
				viewCache: makeTestViewCache(),
			},
			{ navigator: mockNavigator },
		);
		component.setState({ isLoading: false });

		await flushAsyncWork();

		expect(getGenreCalls).toBe(1);
		expect(component.state.hydratedGenre?.imageUrl).toBe('https://g.png');
	});

	valdiIt('does not fetch the genre when it already has an image', async (driver) => {
		const genre = { id: 'genre-1', imageUrl: 'https://existing.png', name: 'Rock' };
		let getGenreCalls = 0;
		const transport = {
			getGenre: async () => {
				getGenreCalls += 1;
				return null;
			},
			getTracksByGenre: emptyTracksPage,
		};

		const component = driver.renderComponent(
			GenreView,
			{
				downloadService,
				genre,
				networkStatus,
				playbackStore,
				preferences,
				transport,
				viewCache: makeTestViewCache(),
			},
			{ navigator: mockNavigator },
		);
		component.setState({ isLoading: false });

		await flushAsyncWork();

		expect(getGenreCalls).toBe(0);
		expect(component.state.hydratedGenre).toBeNull();
	});

	valdiIt('loads the next track page when the trigger scrolls into view', async (driver) => {
		const allTracks = Array.from({ length: TRACK_PAGE_SIZE * 3 }, (_, index) => ({
			artistName: 'Converge',
			duration: 100 + index,
			id: `track-${index}`,
			name: `Track ${index}`,
		}));
		const transport = {
			getGenre: async () => ({ id: 'genre-1', name: 'Hardcore' }),
			getTracksByGenre: async (_id: string, page: number, size: number) => {
				const start = (page - 1) * size;
				return {
					hasMore: start + size < allTracks.length,
					items: allTracks.slice(start, start + size),
					totalCount: allTracks.length,
				};
			},
		};

		const component = driver.renderComponent(
			GenreView,
			{
				downloadService,
				genre: { id: 'genre-1', name: 'Hardcore' },
				networkStatus,
				playbackStore,
				preferences,
				transport,
				viewCache: makeTestViewCache(),
			},
			{ navigator: mockNavigator },
		);
		await flushAsyncWork();
		expect(component.state.tracks.length).toBe(TRACK_PAGE_SIZE);

		scrollLoadMoreTriggerIntoView(component);
		await flushAsyncWork();

		expect(component.state.tracks.length).toBe(TRACK_PAGE_SIZE * 2);
	});

	// the header actions must play the whole genre, not the slice that happens to be on screen
	describe('header playback with only the first page rendered', () => {
		function makePagedTransport(totalTracks: number) {
			const sorts: Array<string | undefined> = [];
			const allTracks = Array.from({ length: totalTracks }, (_, index) => ({
				artistName: 'Converge',
				duration: 100 + index,
				id: `track-${index}`,
				name: `Track ${index}`,
			}));
			return {
				sorts,
				transport: {
					getGenre: async () => ({ id: 'genre-1', name: 'Hardcore' }),
					getTracksByGenre: async (
						_id: string,
						page: number,
						size: number,
						options?: { sort?: string },
					) => {
						sorts.push(options?.sort);
						const start = (page - 1) * size;
						return {
							hasMore: start + size < allTracks.length,
							items: allTracks.slice(start, start + size),
							totalCount: allTracks.length,
						};
					},
				},
			};
		}

		function makeRecordingPlaybackStore() {
			return {
				addToQueue: () => {},
				played: [] as Array<Array<{ id: string }>>,
				playTracks(tracks: Array<{ id: string }>) {
					this.played.push(tracks);
				},
				queueFiller: null as unknown,
				setQueueFiller(filler: unknown) {
					this.queueFiller = filler;
				},
				subscribe: () => () => {},
				track: null,
				trackIndex: 0,
				tracks: [] as Array<{ id: string }>,
			};
		}

		async function renderAndTap(
			driver: Parameters<Parameters<typeof valdiIt>[1]>[0],
			accessibilityLabel: string,
		) {
			const { sorts, transport } = makePagedTransport(TRACK_PAGE_SIZE * 3);
			const store = makeRecordingPlaybackStore();
			const component = driver.renderComponent(
				GenreView,
				{
					downloadService,
					genre: { id: 'genre-1', name: 'Hardcore' },
					networkStatus,
					playbackStore: store,
					preferences,
					transport,
					viewCache: makeTestViewCache(),
				},
				{ navigator: mockNavigator },
			);
			await flushAsyncWork();
			expect(component.state.tracks.length).toBe(TRACK_PAGE_SIZE);

			const button = elementTypeFind(
				componentGetElements(component),
				IRenderedElementViewClass.View,
			).find((view) => view.getAttribute('accessibilityLabel') === accessibilityLabel);
			button?.getAttribute('onTap')?.(touchEvent);
			await flushAsyncWork();

			return { component, sorts, store };
		}

		valdiIt('arms queue backfill when play is tapped', async (driver) => {
			const { store } = await renderAndTap(driver, 'detail-header-play-button');

			expect(store.played.length).toBe(1);
			expect(store.queueFiller).not.toBeNull();
		});

		valdiIt('asks the server to shuffle rather than shuffling the loaded page', async (driver) => {
			const { sorts, store } = await renderAndTap(driver, 'detail-header-shuffle-button');

			expect(sorts).toContain('random');
			expect(store.played.length).toBe(1);
			expect(store.queueFiller).not.toBeNull();
		});
	});

	describe('connection mode changes', () => {
		const genre = { id: 'genre-1', imageUrl: 'https://g.png', name: 'Rock' };

		afterEach(() => {
			appServices.clear();
		});

		valdiIt('reloads against the new transport when going online', async (driver) => {
			const component = driver.renderComponent(
				GenreView,
				{
					downloadService,
					genre,
					networkStatus,
					playbackStore,
					preferences,
					transport: { getGenre: async () => null, getTracksByGenre: emptyTracksPage },
					viewCache: makeTestViewCache(),
				},
				{ navigator: mockNavigator },
			);
			await flushAsyncWork();
			expect(component.state.tracks.length).toBe(0);

			const items = [{ duration: 120, id: 'track-1', name: 'Song One', trackNumber: 1 }];
			setTestAppServices({
				transport: {
					getGenre: async () => null,
					getTracksByGenre: async () => ({ hasMore: false, items, totalCount: 1 }),
				} as unknown as AppServicesBag['transport'],
			});
			await flushAsyncWork();

			expect(component.state.tracks.length).toBe(1);
			expect(component.state.tracks[0].name).toBe('Song One');
		});

		valdiIt('resets paging so the new transport is read from the first page', async (driver) => {
			const requestedPages: Array<number> = [];
			const component = driver.renderComponent(
				GenreView,
				{
					downloadService,
					genre,
					networkStatus,
					playbackStore,
					preferences,
					transport: { getGenre: async () => null, getTracksByGenre: emptyTracksPage },
					viewCache: makeTestViewCache(),
				},
				{ navigator: mockNavigator },
			);
			await flushAsyncWork();

			setTestAppServices({
				transport: {
					getGenre: async () => null,
					getTracksByGenre: async (_id: string, page: number) => {
						requestedPages.push(page);
						return { hasMore: false, items: [], totalCount: 0 };
					},
				} as unknown as AppServicesBag['transport'],
			});
			await flushAsyncWork();

			// paging is 1-based, so a reset cursor re-reads page 1 rather than appending page 2
			expect(requestedPages).toEqual([1]);
			expect(component.state.nextPageFailed).toBe(false);
		});

		valdiIt('does not reload when the transport is unchanged', async (driver) => {
			let getTracksByGenreCalls = 0;
			const transport = {
				getGenre: async () => null,
				getTracksByGenre: async () => {
					getTracksByGenreCalls += 1;
					return { hasMore: false, items: [], totalCount: 0 };
				},
			};

			driver.renderComponent(
				GenreView,
				{
					downloadService,
					genre,
					networkStatus,
					playbackStore,
					preferences,
					transport,
					viewCache: makeTestViewCache(),
				},
				{ navigator: mockNavigator },
			);
			await flushAsyncWork();
			expect(getTracksByGenreCalls).toBe(1);

			// a download-progress notification carries the same transport, so it must not re-fetch
			setTestAppServices({ transport: transport as unknown as AppServicesBag['transport'] });
			await flushAsyncWork();

			expect(getTracksByGenreCalls).toBe(1);
		});
	});
	describe('header artwork context menu', () => {
		const hydrated = { id: 'genre-1', imageUrl: 'https://g.png', name: 'Rock' };

		async function renderWithSlot(overrides: Record<string, unknown>, driver: unknown) {
			const menuPreferences = new Preferences({
				fetchString: async () => '',
				storeString: async () => {},
			});
			await menuPreferences.setAnimationsEnabled(false);
			return (
				driver as { renderComponent: (c: unknown, vm: unknown, ctx: unknown) => unknown }
			).renderComponent(
				GenreViewWithSlot,
				{
					downloadService,
					genre: { id: 'genre-1', name: 'Rock' },
					networkStatus,
					playbackStore,
					preferences: menuPreferences,
					toastService: { show: () => {} },
					transport: {
						getGenre: async () => hydrated,
						getPlaylists: async () => ({ hasMore: false, items: [] }),
						getTracksByGenre: emptyTracksPage,
					},
					viewCache: makeTestViewCache(),
					...overrides,
				},
				{ navigator: mockNavigator },
			);
		}

		valdiIt('opens the card context menu on artwork long press', async (driver) => {
			const component = await renderWithSlot({}, driver);
			await waitForLabel(component, 'detail-header-artwork');
			expect(findByLabel(component, 'detail-header-artwork')).not.toBeUndefined();

			longPressArtwork(component);
			await waitForLabel(component, 'card-context-menu');

			expect(findByLabel(component, 'card-context-menu')).not.toBeUndefined();
			expect(findByLabel(component, 'card-context-pin')).not.toBeUndefined();
			expect(findByLabel(component, 'card-context-instant-mix')).not.toBeUndefined();
		});

		// the view hydrates the entity it was pushed with; the menu must pin that, not the partial
		valdiIt('pins the hydrated entity', async (driver) => {
			const pinned: Array<unknown> = [];
			const pinnedItemsStore = {
				isPinned: () => false,
				pin: (item: unknown) => {
					pinned.push(item);
					return Promise.resolve();
				},
				subscribe: () => () => {},
				unpin: () => Promise.resolve(),
			};
			const component = await renderWithSlot({ pinnedItemsStore }, driver);
			await waitForLabel(component, 'detail-header-artwork');

			longPressArtwork(component);
			await waitForLabel(component, 'card-context-pin');
			findByLabel(component, 'card-context-pin')?.getAttribute('onTap')?.(touchEvent);

			expect(pinned).toEqual([{ genre: hydrated, kind: 'genre' }]);
		});
	});
});
