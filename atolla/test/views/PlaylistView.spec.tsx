import 'jasmine/src/jasmine';
import { Preferences } from 'atolla/src/stores/Preferences';
import { TRACK_PAGE_SIZE } from 'atolla/src/ui/pagination/Grid';
import { PlaylistView } from 'atolla/src/ui/views/PlaylistView';
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

const playbackStore = {
	subscribe: () => () => {},
	track: null,
};

const downloadService = {
	downloadPlaylist: () => {},
	getPlaylistDownloadState: () => 'not_downloaded',
	removePlaylistDownload: () => {},
	subscribe: () => () => {},
};

const preferences = new Preferences({ fetchString: async () => '', storeString: async () => {} });

async function flushAsyncWork() {
	for (let i = 0; i < 10; i += 1) {
		await Promise.resolve();
	}
}

const emptyTracksPage = async () => ({ hasMore: false, items: [], totalCount: 0 });

function findByLabel(
	component: Parameters<typeof componentGetElements>[0],
	accessibilityLabel: string,
) {
	return elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View).find(
		(view) => view.getAttribute('accessibilityLabel') === accessibilityLabel,
	);
}

// track paging keys off the trigger becoming visible, so a layout pass is not the signal to send
function scrollLoadMoreTriggerIntoView(
	component: Parameters<typeof componentGetElements>[0],
): void {
	findByLabel(component, 'playlist-load-more-trigger')?.getAttribute('onVisibilityChanged')?.(
		true,
		0,
	);
}

function makePagedTransport(totalTracks: number, failFromPage?: number) {
	const pagesRequested: Array<number> = [];
	const allTracks = Array.from({ length: totalTracks }, (_, index) => ({
		artistName: 'Fugazi',
		duration: 100 + index,
		id: `track-${index}`,
		name: `Track ${index}`,
		playlistItemId: `item-${index}`,
	}));
	return {
		pagesRequested,
		transport: {
			getPlaylist: async () => ({ id: 'playlist-1', name: 'Roadtrip' }),
			getTracksByPlaylist: async (_id: string, page: number, size: number) => {
				pagesRequested.push(page);
				if (failFromPage != null && page >= failFromPage) {
					throw new Error('page read failed');
				}
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

describe('PlaylistView', () => {
	valdiIt('self-heals the header image when the playlist has no imageUrl', async (driver) => {
		const playlist = { id: 'playlist-1', name: 'Roadtrip' };
		let getPlaylistCalls = 0;
		const transport = {
			getPlaylist: async () => {
				getPlaylistCalls += 1;
				return { id: 'playlist-1', imageUrl: 'https://p.png', name: 'Roadtrip' };
			},
			getTracksByPlaylist: emptyTracksPage,
		};

		const component = driver.renderComponent(
			PlaylistView,
			{
				downloadService,
				onRootDetailControllerReady: () => {},
				playbackStore,
				playlist,
				preferences,
				transport,
				viewCache: makeTestViewCache(),
			},
			{ navigator: mockNavigator },
		);
		component.setState({ isLoading: false });

		await flushAsyncWork();

		expect(getPlaylistCalls).toBe(1);
		expect(component.state.hydratedPlaylist?.imageUrl).toBe('https://p.png');
	});

	valdiIt('does not fetch the playlist when it already has an image', async (driver) => {
		const playlist = { id: 'playlist-1', imageUrl: 'https://existing.png', name: 'Roadtrip' };
		let getPlaylistCalls = 0;
		const transport = {
			getPlaylist: async () => {
				getPlaylistCalls += 1;
				return null;
			},
			getTracksByPlaylist: emptyTracksPage,
		};

		const component = driver.renderComponent(
			PlaylistView,
			{
				downloadService,
				onRootDetailControllerReady: () => {},
				playbackStore,
				playlist,
				preferences,
				transport,
				viewCache: makeTestViewCache(),
			},
			{ navigator: mockNavigator },
		);
		component.setState({ isLoading: false });

		await flushAsyncWork();

		expect(getPlaylistCalls).toBe(0);
		expect(component.state.hydratedPlaylist).toBeNull();
	});

	valdiIt('renders track rows from state', async (driver) => {
		const playlist = { id: 'playlist-1', name: 'Roadtrip' };
		const tracks = [
			{ artistName: 'Artist One', duration: 120, id: 'track-1', name: 'Song One' },
			{ artistName: 'Artist Two', duration: 90, id: 'track-2', name: 'Song Two' },
		];
		const transport = {
			getTracksByPlaylist: async () => ({
				hasMore: false,
				items: tracks,
				totalCount: tracks.length,
			}),
		};

		const component = driver.renderComponent(
			PlaylistView,
			{
				downloadService,
				onRootDetailControllerReady: () => {},
				playbackStore,
				playlist,
				preferences,
				transport,
				viewCache: makeTestViewCache(),
			},
			{ navigator: mockNavigator },
		);
		component.setState({ isLoading: false, tracks });

		expect(component.state.tracks.length).toBe(2);
		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		const values = labels.map((label) => label.getAttribute('value'));
		expect(values).toContain('Song One');
		expect(values).toContain('Song Two');
	});

	valdiIt('renders track count and total duration in header', async (driver) => {
		const playlist = { id: 'playlist-1', name: 'Roadtrip' };
		const transport = {
			getTracksByPlaylist: async () => ({
				hasMore: false,
				items: [
					{ artistName: 'Artist One', duration: 60, id: 'track-1', name: 'Song One' },
					{ artistName: 'Artist Two', duration: 75, id: 'track-2', name: 'Song Two' },
				],
				totalCount: 2,
			}),
		};

		const component = driver.renderComponent(
			PlaylistView,
			{
				downloadService,
				onRootDetailControllerReady: () => {},
				playbackStore,
				playlist,
				preferences,
				transport,
				viewCache: makeTestViewCache(),
			},
			{ navigator: mockNavigator },
		);
		component.setState({
			isLoading: false,
			tracks: [
				{ artistName: 'Artist One', duration: 60, id: 'track-1', name: 'Song One' },
				{ artistName: 'Artist Two', duration: 75, id: 'track-2', name: 'Song Two' },
			],
		});

		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		const values = labels.map((label) => label.getAttribute('value'));
		expect(values).toContain('2 tracks');
		expect(values).toContain('2:15');
	});

	// logos are resolved lazily wherever they are displayed, so the view holds none. downloads are
	// the one consumer that cannot resolve later, and must ask the resolver to fetch them
	valdiIt('resolves artist logos when downloading rather than holding them', async (driver) => {
		const tracks = [{ artistId: 'artist-1', duration: 60, id: 'track-1', name: 'Song One' }];
		const logoCalls: Array<string> = [];
		const transport = {
			getArtist: async (id: string) => ({ id, name: 'Artist One' }),
			getArtistLogoUrl: async (artistId: string) => {
				logoCalls.push(artistId);
				return 'https://logo.png';
			},
			getGenres: async () => [],
			getTrackCacheUrl: (id: string) => `https://stream/${id}`,
			getTracksByPlaylist: async () => ({ hasMore: false, items: tracks, totalCount: 1 }),
		};
		type DownloadPayload = { tracks: Array<{ artistLogoUrl: string | null }> };
		const downloaded: Array<DownloadPayload> = [];

		const component = driver.renderComponent(
			PlaylistView,
			{
				downloadService: {
					...downloadService,
					downloadPlaylist: (payload: DownloadPayload) => {
						downloaded.push(payload);
					},
				},
				onRootDetailControllerReady: () => {},
				playbackStore,
				playlist: { id: 'playlist-1', name: 'Roadtrip' },
				preferences,
				transport,
				viewCache: makeTestViewCache(),
			},
			{ navigator: mockNavigator },
		);
		await flushAsyncWork();
		expect(logoCalls).toEqual([]);

		findByLabel(component, 'detail-header-download-button')?.getAttribute('onTap')?.(touchEvent);
		await flushAsyncWork();

		expect(logoCalls).toEqual(['artist-1']);
		expect(downloaded.length).toBe(1);
		expect(downloaded[0].tracks[0].artistLogoUrl).toBe('https://logo.png');
	});

	describe('demand-driven paging', () => {
		function render(driver: Parameters<Parameters<typeof valdiIt>[1]>[0], transport: unknown) {
			return driver.renderComponent(
				PlaylistView,
				{
					downloadService,
					onRootDetailControllerReady: () => {},
					playbackStore,
					playlist: { id: 'playlist-1', name: 'Roadtrip' },
					preferences,
					transport,
					viewCache: makeTestViewCache(),
				},
				{ navigator: mockNavigator },
			);
		}

		valdiIt('loads the next page when the trigger scrolls into view', async (driver) => {
			const { transport } = makePagedTransport(TRACK_PAGE_SIZE * 3);

			const component = render(driver, transport);
			await flushAsyncWork();
			expect(component.state.tracks.length).toBe(TRACK_PAGE_SIZE);

			scrollLoadMoreTriggerIntoView(component);
			await flushAsyncWork();

			expect(component.state.tracks.length).toBe(TRACK_PAGE_SIZE * 2);
		});

		valdiIt('offers a retry when the next page fails', async (driver) => {
			const { transport } = makePagedTransport(TRACK_PAGE_SIZE * 3, 2);

			const component = render(driver, transport);
			await flushAsyncWork();

			scrollLoadMoreTriggerIntoView(component);
			await flushAsyncWork();

			expect(component.state.nextPageFailed).toBe(true);
			expect(findByLabel(component, 'playlist-load-more-retry')).not.toBeUndefined();
			expect(findByLabel(component, 'playlist-load-more-trigger')).toBeUndefined();
		});

		valdiIt('retrying after a failure loads the page', async (driver) => {
			let failing = true;
			const allTracks = Array.from({ length: TRACK_PAGE_SIZE * 3 }, (_, index) => ({
				artistName: 'Fugazi',
				duration: 100 + index,
				id: `track-${index}`,
				name: `Track ${index}`,
			}));
			const transport = {
				getPlaylist: async () => ({ id: 'playlist-1', name: 'Roadtrip' }),
				getTracksByPlaylist: async (_id: string, page: number, size: number) => {
					if (page > 1 && failing) {
						failing = false;
						throw new Error('page read failed');
					}
					const start = (page - 1) * size;
					return {
						hasMore: start + size < allTracks.length,
						items: allTracks.slice(start, start + size),
						totalCount: allTracks.length,
					};
				},
			};

			const component = render(driver, transport);
			await flushAsyncWork();
			scrollLoadMoreTriggerIntoView(component);
			await flushAsyncWork();
			expect(component.state.nextPageFailed).toBe(true);

			findByLabel(component, 'playlist-load-more-retry')?.getAttribute('onTap')?.(touchEvent);
			await flushAsyncWork();

			expect(component.state.nextPageFailed).toBe(false);
			expect(component.state.tracks.length).toBe(TRACK_PAGE_SIZE * 2);
		});
	});
});
