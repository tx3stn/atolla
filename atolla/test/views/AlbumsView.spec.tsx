import 'jasmine/src/jasmine';
import { PlaybackStore } from 'atolla/src/stores/Playback';
import { Preferences } from 'atolla/src/stores/Preferences';
import { AlbumsView } from 'atolla/src/ui/views/AlbumsView';
import { AlbumView } from 'atolla/src/ui/views/AlbumView';
import { makeTestViewCache } from 'atolla/test/util/viewCache';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';
import { touchEvent } from '../util/testEvents';

const pageSize = 24;

const stubImageCache = {
	get: () => null,
	getOrLoad: () => null,
	prefetch: () => Promise.resolve(),
	subscribe: () => () => {},
};

function makeAlbums(count: number) {
	return Array.from({ length: count }, (_, index) => ({
		artistId: `artist-${index}`,
		artistName: `Artist ${index}`,
		id: `album-${index}`,
		imageUrl: `https://example.com/album-${index}.jpg`,
		name: `Album ${String(index).padStart(3, '0')}`,
	}));
}

async function flushAsyncWork() {
	await Promise.resolve();
	await Promise.resolve();
}

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

function makePreferences(): Preferences {
	return new Preferences({ fetchString: async () => '', storeString: async () => {} });
}

// the grid pages in when its prefetch trigger scrolls into view, so drive that signal rather
// than a layout pass: a layout edge only arrives incidentally and paging must not depend on it
function scrollPrefetchTriggerIntoView(
	component: Parameters<typeof componentGetElements>[0],
): void {
	const trigger = elementTypeFind(
		componentGetElements(component),
		IRenderedElementViewClass.View,
	).find((view) => view.getAttribute('accessibilityLabel') === 'grid-prefetch-trigger');
	trigger?.getAttribute('onVisibilityChanged')?.(true, 0);
}

describe('AlbumsView', () => {
	valdiIt('loads first page only on create', async (driver) => {
		const allAlbums = makeAlbums(70);
		const transport = {
			getAlbums: (page: number, size: number) => {
				const start = (page - 1) * size;
				const end = start + size;
				return Promise.resolve({
					hasMore: end < allAlbums.length,
					items: allAlbums.slice(start, end),
				});
			},
		};

		const viewModel = {
			imageCache: stubImageCache,
			navigationController: makeNavigationController(),
			playbackStore: new PlaybackStore(),
			preferences: makePreferences(),
			transport,
			viewCache: makeTestViewCache(),
		};
		const component = driver.renderComponent(AlbumsView, viewModel, undefined);

		await flushAsyncWork();
		await flushAsyncWork();

		expect(component.state.albums.length).toBe(pageSize);
	});

	valdiIt('paints albums from the view cache before the network resolves', async (driver) => {
		const cached = makeAlbums(5);
		const viewCache = makeTestViewCache();
		viewCache.store('list:albums:all:online', cached);

		type Page = { hasMore: boolean; items: ReturnType<typeof makeAlbums> };
		let resolveNetwork: ((value: Page) => void) | undefined;
		const transport = {
			getAlbums: () =>
				new Promise<Page>((resolve) => {
					resolveNetwork = resolve;
				}),
		};

		const viewModel = {
			imageCache: stubImageCache,
			navigationController: makeNavigationController(),
			playbackStore: new PlaybackStore(),
			preferences: makePreferences(),
			transport,
			viewCache,
		};
		const component = driver.renderComponent(AlbumsView, viewModel, undefined);

		// the cached page paints synchronously on create, before the network settles
		expect(component.state.albums.length).toBe(5);

		resolveNetwork?.({ hasMore: false, items: makeAlbums(24) });
		await flushAsyncWork();

		// the fresh network result replaces the cached paint
		expect(component.state.albums.length).toBe(24);
	});

	valdiIt('loads next page when prefetch trigger scrolls into view', async (driver) => {
		const allAlbums = makeAlbums(80);
		const transport = {
			getAlbums: (page: number, size: number) => {
				const start = (page - 1) * size;
				const end = start + size;
				return Promise.resolve({
					hasMore: end < allAlbums.length,
					items: allAlbums.slice(start, end),
				});
			},
		};

		const viewModel = {
			imageCache: stubImageCache,
			navigationController: makeNavigationController(),
			playbackStore: new PlaybackStore(),
			preferences: makePreferences(),
			transport,
			viewCache: makeTestViewCache(),
		};
		const component = driver.renderComponent(AlbumsView, viewModel, undefined);

		await flushAsyncWork();
		await flushAsyncWork();
		expect(component.state.albums.length).toBe(pageSize);

		scrollPrefetchTriggerIntoView(component);
		await flushAsyncWork();

		expect(component.state.albums.length).toBe(pageSize * 2);

		scrollPrefetchTriggerIntoView(component);
		await flushAsyncWork();

		expect(component.state.albums.length).toBe(pageSize * 3);

		scrollPrefetchTriggerIntoView(component);
		await flushAsyncWork();

		expect(component.state.albums.length).toBe(80);
	});

	valdiIt('shows retry state when next page fails and recovers on retry', async (driver) => {
		const allAlbums = makeAlbums(90);
		let shouldFailThirdPage = true;
		const transport = {
			getAlbums: (page: number, size: number) => {
				if (page === 3 && shouldFailThirdPage) {
					return Promise.reject(new Error('load more failed'));
				}
				const start = (page - 1) * size;
				const end = start + size;
				return Promise.resolve({
					hasMore: end < allAlbums.length,
					items: allAlbums.slice(start, end),
				});
			},
		};

		const viewModel = {
			imageCache: stubImageCache,
			navigationController: makeNavigationController(),
			playbackStore: new PlaybackStore(),
			preferences: makePreferences(),
			transport,
			viewCache: makeTestViewCache(),
		};
		const component = driver.renderComponent(AlbumsView, viewModel, undefined);

		await flushAsyncWork();
		await flushAsyncWork();
		expect(component.state.albums.length).toBe(pageSize);

		scrollPrefetchTriggerIntoView(component);
		await flushAsyncWork();

		expect(component.state.albums.length).toBe(pageSize * 2);

		scrollPrefetchTriggerIntoView(component);
		await flushAsyncWork();

		expect(component.state.nextPageFailed).toBeTrue();
		expect(component.state.albums.length).toBe(pageSize * 2);

		shouldFailThirdPage = false;
		component.retryLoadMore();
		await flushAsyncWork();

		expect(component.state.nextPageFailed).toBeFalse();
		expect(component.state.albums.length).toBe(pageSize * 3);

		scrollPrefetchTriggerIntoView(component);
		await flushAsyncWork();
		expect(component.state.albums.length).toBe(90);
	});

	valdiIt('requests a server-side prefix filter when a letter filter is active', async (driver) => {
		const requestedStartsWith: Array<string | undefined> = [];
		const transport = {
			getAlbums: (_page: number, _size: number, options?: { startsWith?: string }) => {
				requestedStartsWith.push(options?.startsWith);
				return Promise.resolve({ hasMore: false, items: makeAlbums(3) });
			},
		};

		const viewModel = {
			imageCache: stubImageCache,
			letterFilter: 'a',
			navigationController: makeNavigationController(),
			playbackStore: new PlaybackStore(),
			preferences: makePreferences(),
			transport,
			viewCache: makeTestViewCache(),
		};
		driver.renderComponent(AlbumsView, viewModel, undefined);

		await flushAsyncWork();
		await flushAsyncWork();

		expect(requestedStartsWith).toContain('a');
	});

	valdiIt('renders album titles from state', async (driver) => {
		const albums = [
			{ artistId: 'artist-1', artistName: 'Artist One', id: 'album-1', name: 'First Album' },
			{ artistId: 'artist-2', artistName: 'Artist Two', id: 'album-2', name: 'Second Album' },
		];
		const transport = {
			getAlbums: async () => ({ hasMore: false, items: albums }),
		};

		const viewModel = {
			imageCache: stubImageCache,
			navigationController: makeNavigationController(),
			playbackStore: new PlaybackStore(),
			preferences: makePreferences(),
			transport,
			viewCache: makeTestViewCache(),
		};
		const component = driver.renderComponent(AlbumsView, viewModel, undefined);
		component.setState({ albums });

		expect(component.state.albums.length).toBe(2);
		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		const values = labels.map((label) => label.getAttribute('value'));
		expect(values).toContain('First Album');
		expect(values).toContain('Second Album');
	});

	valdiIt('pushes AlbumView when card is tapped', async (driver) => {
		const albums = [
			{ artistId: 'artist-1', artistName: 'Artist One', id: 'album-1', name: 'First Album' },
		];
		const transport = {
			getAlbums: async () => ({ hasMore: false, items: albums }),
		};

		const navigationController = makeNavigationController();
		const viewModel = {
			imageCache: stubImageCache,
			navigationController,
			playbackStore: new PlaybackStore(),
			preferences: makePreferences(),
			transport,
			viewCache: makeTestViewCache(),
		};
		const component = driver.renderComponent(AlbumsView, viewModel, undefined);
		component.setState({ albums });

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const firstCard = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'card-album-1',
		);
		firstCard?.getAttribute('onTap')?.(touchEvent);

		const { component: pushedComponent, viewModel: pushedViewModel } =
			navigationController.getPushed();
		expect(pushedComponent).toBe(AlbumView);
		expect(pushedViewModel?.album?.id).toBe('album-1');
	});

	valdiIt('opens context menu when card is long pressed', async (driver) => {
		const albums = [
			{ artistId: 'artist-1', artistName: 'Artist One', id: 'album-1', name: 'First Album' },
		];
		const transport = {
			getAlbums: async () => ({ hasMore: false, items: albums }),
			getArtistLogoUrl: async () => null,
		};

		const viewModel = {
			imageCache: stubImageCache,
			navigationController: makeNavigationController(),
			playbackStore: new PlaybackStore(),
			preferences: makePreferences(),
			transport,
			viewCache: makeTestViewCache(),
		};
		const component = driver.renderComponent(AlbumsView, viewModel, undefined);
		component.setState({ albums });

		component.handleAlbumCardLongPress({ id: 'album-1', kind: 'album' });

		expect(component.state.contextMenuCard).toEqual({ album: albums[0], kind: 'album' });
	});

	valdiIt(
		'shows the nothing-downloaded empty state when offline with no albums',
		async (driver) => {
			const transport = {
				getAlbums: async () => ({ hasMore: false, items: [] }),
			};

			const viewModel = {
				imageCache: stubImageCache,
				isOfflineMode: true,
				navigationController: makeNavigationController(),
				playbackStore: new PlaybackStore(),
				preferences: makePreferences(),
				transport,
				viewCache: makeTestViewCache(),
			};
			const component = driver.renderComponent(AlbumsView, viewModel, undefined);

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

	valdiIt('hides the empty state when offline albums are present', async (driver) => {
		const transport = {
			getAlbums: async () => ({
				hasMore: false,
				items: [
					{ artistId: 'artist-1', artistName: 'Artist One', id: 'album-1', name: 'First Album' },
				],
			}),
		};

		const viewModel = {
			imageCache: stubImageCache,
			isOfflineMode: true,
			navigationController: makeNavigationController(),
			playbackStore: new PlaybackStore(),
			preferences: makePreferences(),
			transport,
			viewCache: makeTestViewCache(),
		};
		const component = driver.renderComponent(AlbumsView, viewModel, undefined);

		await flushAsyncWork();
		await flushAsyncWork();

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const emptyState = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'library-empty-state',
		);
		expect(emptyState).toBeUndefined();
	});
});
