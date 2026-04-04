// @ts-nocheck
import 'jasmine/src/jasmine';
import { PlaylistsView } from 'atolla/src/ui/views/PlaylistsView';
import { PlaylistView } from 'atolla/src/ui/views/PlaylistView';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { createComponent, valdiIt } from 'valdi_test/test/JSXTestUtils';

const playbackStore = {
	subscribe: () => () => {},
	track: null,
};

const stubImageCache = {
	prefetch: () => Promise.resolve(),
	subscribe: () => () => {},
};

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

describe('PlaylistsView', () => {
	valdiIt('renders playlist names from state', () => {
		const playlists = [
			{ id: 'playlist-1', name: 'Roadtrip' },
			{ id: 'playlist-2', name: 'Night Run' },
		];
		const transport = {
			getAllPlaylists: async () => playlists,
		};

		const instrumented = createComponent(PlaylistsView, {
			imageCache: stubImageCache,
			navigationController: makeNavigationController(),
			playbackStore,
			transport,
		});
		const component = instrumented.getComponent();
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

	valdiIt('pushes PlaylistView when card is tapped', () => {
		const playlists = [{ id: 'playlist-1', name: 'Roadtrip' }];
		const transport = {
			getAllPlaylists: async () => playlists,
		};

		const navigationController = makeNavigationController();
		const instrumented = createComponent(PlaylistsView, {
			imageCache: stubImageCache,
			navigationController,
			playbackStore,
			transport,
		});
		const component = instrumented.getComponent();
		component.setState({ playlists });

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const firstCard = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'card-playlist-1',
		);
		firstCard?.getAttribute('onTap')?.();

		const { component: pushedComponent, viewModel: pushedViewModel } =
			navigationController.getPushed();
		expect(pushedComponent).toBe(PlaylistView);
		expect(pushedViewModel?.playlist?.id).toBe('playlist-1');
	});

	valdiIt('plays playlist tracks when card is long pressed', async () => {
		const playlists = [{ id: 'playlist-1', name: 'Roadtrip' }];
		const playlistTracks = [
			{ artistId: 'artist-1', duration: 200, id: 'track-1', name: 'Track One' },
		];
		const transport = {
			getAllPlaylists: async () => playlists,
			getArtistLogoUrl: async () => 'https://example.com/artist-logo.jpg',
			getTracksByPlaylist: async () => playlistTracks,
		};
		const playbackStoreWithLongPress = {
			playWithArtistLogos: () => {},
			subscribe: () => () => {},
			track: null,
		};
		spyOn(playbackStoreWithLongPress, 'playWithArtistLogos');

		const instrumented = createComponent(PlaylistsView, {
			imageCache: stubImageCache,
			navigationController: makeNavigationController(),
			playbackStore: playbackStoreWithLongPress,
			transport,
		});
		const component = instrumented.getComponent();
		component.setState({ playlists });

		component.handlePlaylistCardLongPress({ id: 'playlist-1', kind: 'playlist' });
		await Promise.resolve();
		await Promise.resolve();

		expect(playbackStoreWithLongPress.playWithArtistLogos).toHaveBeenCalledWith(playlistTracks, [
			'https://example.com/artist-logo.jpg',
		]);
	});
});
