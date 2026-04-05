// @ts-nocheck
import 'jasmine/src/jasmine';
import { PlaybackStore } from 'atolla/src/stores/Playback';
import { AlbumsView } from 'atolla/src/ui/views/AlbumsView';
import { AlbumView } from 'atolla/src/ui/views/AlbumView';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { createComponent, valdiIt } from 'valdi_test/test/JSXTestUtils';

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
	let pushedComponent = null;
	let pushedViewModel = null;
	const navigationController = {
		getPushed: () => ({ component: pushedComponent, viewModel: pushedViewModel }),
		push: (component, viewModel) => {
			pushedComponent = component;
			pushedViewModel = viewModel;
		},
	};
	return navigationController;
}

describe('AlbumsView', () => {
	valdiIt('loads first page only on create', async () => {
		const allAlbums = makeAlbums(70);
		const prefetchCalls: Array<Array<string>> = [];
		const imageCache = {
			...stubImageCache,
			prefetch: (urls: Array<string>) => {
				prefetchCalls.push(urls);
				return Promise.resolve();
			},
		};
		const transport = {
			getAlbumsPage: (page: number, size: number) => {
				const start = (page - 1) * size;
				const end = start + size;
				return Promise.resolve({
					hasMore: end < allAlbums.length,
					items: allAlbums.slice(start, end),
				});
			},
		};

		const instrumented = createComponent(AlbumsView, {
			imageCache,
			navigationController: makeNavigationController(),
			playbackStore: new PlaybackStore(),
			transport,
		});
		const component = instrumented.getComponent();

		await flushAsyncWork();
		await flushAsyncWork();

		expect(component.state.albums.length).toBe(pageSize);
		expect(prefetchCalls.length).toBe(1);
		expect(prefetchCalls[0]?.length).toBe(pageSize);
	});

	valdiIt('loads next page when prefetch trigger is laid out', async () => {
		const allAlbums = makeAlbums(80);
		const transport = {
			getAlbumsPage: (page: number, size: number) => {
				const start = (page - 1) * size;
				const end = start + size;
				return Promise.resolve({
					hasMore: end < allAlbums.length,
					items: allAlbums.slice(start, end),
				});
			},
		};

		const instrumented = createComponent(AlbumsView, {
			imageCache: stubImageCache,
			navigationController: makeNavigationController(),
			playbackStore: new PlaybackStore(),
			transport,
		});
		const component = instrumented.getComponent();

		await flushAsyncWork();
		await flushAsyncWork();
		expect(component.state.albums.length).toBe(pageSize);

		let views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		let prefetchTrigger = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'grid-prefetch-trigger',
		);
		prefetchTrigger?.getAttribute('onLayout')?.();
		await flushAsyncWork();

		expect(component.state.albums.length).toBe(pageSize * 2);

		views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		prefetchTrigger = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'grid-prefetch-trigger',
		);
		prefetchTrigger?.getAttribute('onLayout')?.();
		await flushAsyncWork();

		expect(component.state.albums.length).toBe(pageSize * 3);

		views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		prefetchTrigger = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'grid-prefetch-trigger',
		);
		prefetchTrigger?.getAttribute('onLayout')?.();
		await flushAsyncWork();

		expect(component.state.albums.length).toBe(80);
	});

	valdiIt('shows retry state when next page fails and recovers on retry', async () => {
		const allAlbums = makeAlbums(90);
		let shouldFailThirdPage = true;
		const transport = {
			getAlbumsPage: (page: number, size: number) => {
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

		const instrumented = createComponent(AlbumsView, {
			imageCache: stubImageCache,
			navigationController: makeNavigationController(),
			playbackStore: new PlaybackStore(),
			transport,
		});
		const component = instrumented.getComponent();

		await flushAsyncWork();
		await flushAsyncWork();
		expect(component.state.albums.length).toBe(pageSize);

		let views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		let prefetchTrigger = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'grid-prefetch-trigger',
		);
		prefetchTrigger?.getAttribute('onLayout')?.();
		await flushAsyncWork();

		expect(component.state.albums.length).toBe(pageSize * 2);

		views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		prefetchTrigger = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'grid-prefetch-trigger',
		);
		prefetchTrigger?.getAttribute('onLayout')?.();
		await flushAsyncWork();

		expect(component.state.nextPageFailed).toBeTrue();
		expect(component.state.albums.length).toBe(pageSize * 2);

		shouldFailThirdPage = false;
		component.retryLoadMore();
		await flushAsyncWork();

		expect(component.state.nextPageFailed).toBeFalse();
		expect(component.state.albums.length).toBe(pageSize * 3);

		views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		prefetchTrigger = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'grid-prefetch-trigger',
		);
		prefetchTrigger?.getAttribute('onLayout')?.();
		await flushAsyncWork();
		expect(component.state.albums.length).toBe(90);
	});

	valdiIt('renders album titles from state', () => {
		const albums = [
			{ artistId: 'artist-1', artistName: 'Artist One', id: 'album-1', name: 'First Album' },
			{ artistId: 'artist-2', artistName: 'Artist Two', id: 'album-2', name: 'Second Album' },
		];
		const transport = {
			getAllAlbums: async () => albums,
		};

		const instrumented = createComponent(AlbumsView, {
			imageCache: stubImageCache,
			navigationController: makeNavigationController(),
			playbackStore: new PlaybackStore(),
			transport,
		});
		const component = instrumented.getComponent();
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

	valdiIt('pushes AlbumView when card is tapped', () => {
		const albums = [
			{ artistId: 'artist-1', artistName: 'Artist One', id: 'album-1', name: 'First Album' },
		];
		const transport = {
			getAllAlbums: async () => albums,
		};

		const navigationController = makeNavigationController();
		const instrumented = createComponent(AlbumsView, {
			imageCache: stubImageCache,
			navigationController,
			playbackStore: new PlaybackStore(),
			transport,
		});
		const component = instrumented.getComponent();
		component.setState({ albums });

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const firstCard = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'card-album-1',
		);
		firstCard?.getAttribute('onTap')?.();

		const { component: pushedComponent, viewModel: pushedViewModel } =
			navigationController.getPushed();
		expect(pushedComponent).toBe(AlbumView);
		expect(pushedViewModel?.album?.id).toBe('album-1');
	});

	valdiIt('plays album tracks when card is long pressed', async () => {
		const albums = [
			{ artistId: 'artist-1', artistName: 'Artist One', id: 'album-1', name: 'First Album' },
		];
		const albumTracks = [{ albumId: 'album-1', duration: 180, id: 'track-1', name: 'Track One' }];
		const transport = {
			getAllAlbums: async () => albums,
			getArtistLogoUrl: async () => 'https://example.com/artist-logo.jpg',
			getTracksByAlbum: async () => albumTracks,
		};

		const playbackStore = new PlaybackStore();
		spyOn(playbackStore, 'play');
		spyOn(playbackStore, 'setArtistLogoUrl');

		const instrumented = createComponent(AlbumsView, {
			imageCache: stubImageCache,
			navigationController: makeNavigationController(),
			playbackStore,
			transport,
		});
		const component = instrumented.getComponent();
		component.setState({ albums });

		component.handleAlbumCardLongPress({ id: 'album-1', kind: 'album' });
		await flushAsyncWork();
		await flushAsyncWork();

		expect(playbackStore.play).toHaveBeenCalledWith(albumTracks, albums[0]);
		expect(playbackStore.setArtistLogoUrl).toHaveBeenCalledWith(
			'https://example.com/artist-logo.jpg',
		);
	});
});
