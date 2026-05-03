import 'jasmine/src/jasmine';
import { PlaybackStore } from 'atolla/src/stores/Playback';
import { ArtistsView } from 'atolla/src/ui/views/ArtistsView';
import { ArtistView } from 'atolla/src/ui/views/ArtistView';
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

function makeArtists(count: number) {
	return Array.from({ length: count }, (_, index) => ({
		id: `artist-${index}`,
		imageUrl: `https://example.com/artist-${index}.jpg`,
		name: `Artist ${String(index).padStart(3, '0')}`,
	}));
}

async function flushAsyncWork() {
	await Promise.resolve();
	await Promise.resolve();
}

describe('ArtistsView', () => {
	valdiIt('renders artist names from state', async () => {
		const artists = [
			{ id: 'artist-1', name: 'Artist One' },
			{ id: 'artist-2', name: 'Artist Two' },
		];
		const transport = {
			getAllArtists: async () => artists,
		};

		const instrumented = createComponent(ArtistsView, {
			gridColumns: 3,
			imageCache: stubImageCache,
			navigationController: makeNavigationController(),
			playbackStore: new PlaybackStore(),
			transport,
		});
		const component = instrumented.getComponent();
		component.setState({ artists });

		expect(component.state.artists.length).toBe(2);
		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		const values = labels.map((label) => label.getAttribute('value'));
		expect(values).toContain('Artist One');
		expect(values).toContain('Artist Two');
	});

	valdiIt('pushes ArtistView when card is tapped', async () => {
		const artists = [{ id: 'artist-1', name: 'Artist One' }];
		const transport = {
			getAllArtists: async () => artists,
		};

		const navigationController = makeNavigationController();
		const instrumented = createComponent(ArtistsView, {
			gridColumns: 3,
			imageCache: stubImageCache,
			navigationController,
			playbackStore: new PlaybackStore(),
			transport,
		});
		const component = instrumented.getComponent();
		component.setState({ artists });

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const firstCard = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'card-artist-1',
		);
		firstCard?.getAttribute('onTap')?.();

		const { component: pushedComponent, viewModel: pushedViewModel } =
			navigationController.getPushed();
		expect(pushedComponent).toBe(ArtistView);
		expect(pushedViewModel?.artist?.id).toBe('artist-1');
	});

	valdiIt('plays artist tracks when card is long pressed', async () => {
		const artists = [
			{ id: 'artist-1', logoUrl: 'https://example.com/logo.jpg', name: 'Artist One' },
		];
		const artistTracks = [{ duration: 210, id: 'track-1', name: 'Track One' }];
		const transport = {
			getAllArtists: async () => artists,
			getTracksByArtist: async () => artistTracks,
		};

		const playbackStore = new PlaybackStore();
		spyOn(playbackStore, 'playTracks');
		spyOn(playbackStore, 'setArtistLogoUrl');

		const instrumented = createComponent(ArtistsView, {
			gridColumns: 3,
			imageCache: stubImageCache,
			navigationController: makeNavigationController(),
			playbackStore,
			transport,
		});
		const component = instrumented.getComponent();
		component.setState({ artists });

		component.handleArtistCardLongPress({ id: 'artist-1', kind: 'artist' });
		await Promise.resolve();

		expect(playbackStore.playTracks).toHaveBeenCalledWith(artistTracks);
		expect(playbackStore.setArtistLogoUrl).toHaveBeenCalledWith('https://example.com/logo.jpg');
	});

	valdiIt('loads next artist page when prefetch trigger is laid out', async () => {
		const allArtists = makeArtists(60);
		const transport = {
			getArtistsPage: (page: number, size: number) => {
				const start = (page - 1) * size;
				const end = start + size;
				return Promise.resolve({
					hasMore: end < allArtists.length,
					items: allArtists.slice(start, end),
				});
			},
		};

		const instrumented = createComponent(ArtistsView, {
			gridColumns: 3,
			imageCache: stubImageCache,
			navigationController: makeNavigationController(),
			playbackStore: new PlaybackStore(),
			transport,
		});
		const component = instrumented.getComponent();

		await flushAsyncWork();
		await flushAsyncWork();
		expect(component.state.artists.length).toBe(pageSize);

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const prefetchTrigger = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'grid-prefetch-trigger',
		);
		prefetchTrigger?.getAttribute('onLayout')?.();
		await flushAsyncWork();

		expect(component.state.artists.length).toBe(pageSize * 2);
	});
});
