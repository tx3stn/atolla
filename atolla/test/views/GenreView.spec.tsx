import 'jasmine/src/jasmine';
import { Preferences } from 'atolla/src/stores/Preferences';
import { TRACK_PAGE_SIZE } from 'atolla/src/ui/pagination/Grid';
import { GenreView } from 'atolla/src/ui/views/GenreView';
import { makeTestViewCache } from 'atolla/test/util/viewCache';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';
import { touchEvent } from '../util/testEvents';

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
				onRootDetailControllerReady: () => {},
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
				onRootDetailControllerReady: () => {},
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
				onRootDetailControllerReady: () => {},
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
					onRootDetailControllerReady: () => {},
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
});
