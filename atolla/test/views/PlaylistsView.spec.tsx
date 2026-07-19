import 'jasmine/src/jasmine';
import { Preferences } from 'atolla/src/stores/Preferences';
import { PlaylistsView } from 'atolla/src/ui/views/PlaylistsView';
import { PlaylistView } from 'atolla/src/ui/views/PlaylistView';
import { makeTestViewCache } from 'atolla/test/util/viewCache';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';
import { touchEvent } from '../util/testEvents';

const pageSize = 24;

const playbackStore = {
	subscribe: () => () => {},
	track: null,
};

const stubImageCache = {
	prefetch: () => Promise.resolve(),
	subscribe: () => () => {},
};

function makeNavigationController() {
	let pushedComponent: unknown = null;
	let pushedViewModel: Record<string, { id?: string }> | null = null;
	const navigationController = {
		getPushed: () => ({ component: pushedComponent, viewModel: pushedViewModel }),
		push: (component: unknown, viewModel: unknown) => {
			pushedComponent = component;
			pushedViewModel = viewModel as Record<string, { id?: string }>;
		},
	};
	return navigationController;
}

function makePlaylists(count: number) {
	return Array.from({ length: count }, (_, index) => ({
		id: `playlist-${index}`,
		imageUrl: `https://example.com/playlist-${index}.jpg`,
		name: `Playlist ${String(index).padStart(3, '0')}`,
	}));
}

async function flushAsyncWork() {
	await Promise.resolve();
	await Promise.resolve();
}

function makePreferences(): Preferences {
	return new Preferences({ fetchString: async () => '', storeString: async () => {} });
}

describe('PlaylistsView', () => {
	valdiIt('renders playlist names from state', async (driver) => {
		const playlists = [
			{ id: 'playlist-1', name: 'Roadtrip' },
			{ id: 'playlist-2', name: 'Night Run' },
		];
		const transport = {
			getPlaylists: async () => ({ hasMore: false, items: playlists }),
		};

		const viewModel = {
			imageCache: stubImageCache,
			navigationController: makeNavigationController(),
			playbackStore,
			preferences: makePreferences(),
			transport,
			viewCache: makeTestViewCache(),
		};
		const component = driver.renderComponent(PlaylistsView, viewModel, undefined);
		component.setState({ playlists });

		expect(component.state.playlists.length).toBe(2);
		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		const values = labels.map((label) => label.getAttribute('value'));
		expect(values).toContain('Roadtrip');
		expect(values).toContain('Night Run');
	});

	valdiIt('pushes PlaylistView when card is tapped', async (driver) => {
		const playlists = [{ id: 'playlist-1', name: 'Roadtrip' }];
		const transport = {
			getPlaylists: async () => ({ hasMore: false, items: playlists }),
		};

		const navigationController = makeNavigationController();
		const viewModel = {
			imageCache: stubImageCache,
			navigationController,
			playbackStore,
			preferences: makePreferences(),
			transport,
			viewCache: makeTestViewCache(),
		};
		const component = driver.renderComponent(PlaylistsView, viewModel, undefined);
		component.setState({ playlists });

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const firstCard = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'card-playlist-1',
		);
		firstCard?.getAttribute('onTap')?.(touchEvent);

		const { component: pushedComponent, viewModel: pushedViewModel } =
			navigationController.getPushed();
		expect(pushedComponent).toBe(PlaylistView);
		expect(pushedViewModel?.playlist?.id).toBe('playlist-1');
	});

	valdiIt('opens context menu when card is long pressed', async (driver) => {
		const playlists = [{ id: 'playlist-1', name: 'Roadtrip' }];
		const transport = {
			getPlaylists: async () => ({ hasMore: false, items: playlists }),
		};

		const viewModel = {
			imageCache: stubImageCache,
			navigationController: makeNavigationController(),
			playbackStore,
			preferences: makePreferences(),
			transport,
			viewCache: makeTestViewCache(),
		};
		const component = driver.renderComponent(PlaylistsView, viewModel, undefined);
		component.setState({ playlists });

		component.handlePlaylistCardLongPress({ id: 'playlist-1', kind: 'playlist' });

		expect(component.state.contextMenuCard).toEqual({ kind: 'playlist', playlist: playlists[0] });
	});

	valdiIt('requests a server-side prefix filter when a letter filter is active', async (driver) => {
		const requestedStartsWith: Array<string | undefined> = [];
		const transport = {
			getPlaylists: (_page: number, _size: number, options?: { startsWith?: string }) => {
				requestedStartsWith.push(options?.startsWith);
				return Promise.resolve({ hasMore: false, items: makePlaylists(3) });
			},
		};

		const viewModel = {
			imageCache: stubImageCache,
			letterFilter: 'a',
			navigationController: makeNavigationController(),
			playbackStore,
			preferences: makePreferences(),
			transport,
			viewCache: makeTestViewCache(),
		};
		driver.renderComponent(PlaylistsView, viewModel, undefined);

		await flushAsyncWork();
		await flushAsyncWork();

		expect(requestedStartsWith).toContain('a');
	});

	valdiIt('loads next playlist page when prefetch trigger scrolls into view', async (driver) => {
		const allPlaylists = makePlaylists(60);
		const transport = {
			getPlaylists: (page: number, size: number) => {
				const start = (page - 1) * size;
				const end = start + size;
				return Promise.resolve({
					hasMore: end < allPlaylists.length,
					items: allPlaylists.slice(start, end),
				});
			},
		};

		const viewModel = {
			imageCache: stubImageCache,
			navigationController: makeNavigationController(),
			playbackStore,
			preferences: makePreferences(),
			transport,
			viewCache: makeTestViewCache(),
		};
		const component = driver.renderComponent(PlaylistsView, viewModel, undefined);

		await flushAsyncWork();
		await flushAsyncWork();
		expect(component.state.playlists.length).toBe(pageSize);

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const prefetchTrigger = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'grid-prefetch-trigger',
		);
		prefetchTrigger?.getAttribute('onVisibilityChanged')?.(true, 0);
		await flushAsyncWork();

		expect(component.state.playlists.length).toBe(pageSize * 2);
	});

	valdiIt(
		'shows the nothing-downloaded empty state when offline with no playlists',
		async (driver) => {
			const transport = {
				getPlaylists: async () => ({ hasMore: false, items: [] }),
			};

			const viewModel = {
				imageCache: stubImageCache,
				isOfflineMode: true,
				navigationController: makeNavigationController(),
				playbackStore,
				preferences: makePreferences(),
				transport,
				viewCache: makeTestViewCache(),
			};
			const component = driver.renderComponent(PlaylistsView, viewModel, undefined);

			await flushAsyncWork();
			await flushAsyncWork();

			const views = elementTypeFind(
				componentGetElements(component),
				IRenderedElementViewClass.View,
			);
			const emptyState = views.find(
				(view) => view.getAttribute('accessibilityLabel') === 'library-empty-state',
			);
			expect(emptyState).toBeDefined();
		},
	);

	valdiIt('hides the empty state when offline playlists are present', async (driver) => {
		const transport = {
			getPlaylists: async () => ({
				hasMore: false,
				items: [{ id: 'playlist-1', name: 'Roadtrip' }],
			}),
		};

		const viewModel = {
			imageCache: stubImageCache,
			isOfflineMode: true,
			navigationController: makeNavigationController(),
			playbackStore,
			preferences: makePreferences(),
			transport,
			viewCache: makeTestViewCache(),
		};
		const component = driver.renderComponent(PlaylistsView, viewModel, undefined);

		await flushAsyncWork();
		await flushAsyncWork();

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const emptyState = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'library-empty-state',
		);
		expect(emptyState).toBeUndefined();
	});
});
