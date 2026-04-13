// @ts-nocheck
import 'jasmine/src/jasmine';
import { PlaybackStore } from 'atolla/src/stores/Playback';
import { AlbumView } from 'atolla/src/ui/views/AlbumView';
import { ArtistView } from 'atolla/src/ui/views/ArtistView';
import { PlaylistView } from 'atolla/src/ui/views/PlaylistView';
import { SearchView } from 'atolla/src/ui/views/SearchView';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { createComponent, valdiIt } from 'valdi_test/test/JSXTestUtils';

const stubImageCache = {
	get: () => null,
	getOrLoad: () => null,
	prefetch: () => Promise.resolve(),
	subscribe: () => () => {},
};

function flushAsyncWork(): Promise<void> {
	return Promise.resolve().then(() => Promise.resolve());
}

function makeSearchStore(initialRecent = []) {
	let recent = [...initialRecent];
	return {
		addRecentSearch: (term: string) => {
			recent = [
				term,
				...recent.filter((value) => value.toLowerCase() !== term.toLowerCase()),
			].slice(0, 5);
			return Promise.resolve(recent);
		},
		getRecentSearches: () => Promise.resolve(recent),
	};
}

function makeNavigationController() {
	let pushedComponent = null;
	let pushedViewModel = null;
	return {
		getPushed: () => ({ component: pushedComponent, viewModel: pushedViewModel }),
		push: (component, viewModel) => {
			pushedComponent = component;
			pushedViewModel = viewModel;
		},
	};
}

describe('SearchView', () => {
	valdiIt('starts with an empty query', () => {
		const instrumented = createComponent(SearchView, {
			animationsEnabled: true,
			gridColumns: 3,
			imageCache: stubImageCache,
			navigationController: makeNavigationController(),
			playbackStore: new PlaybackStore(),
			searchStore: makeSearchStore(),
			transport: {
				search: () => Promise.resolve({ albums: [], artists: [], playlists: [], tracks: [] }),
			},
		});
		const component = instrumented.getComponent();

		expect(component.state.query).toBe('');
	});

	valdiIt('updates query state when textfield changes', () => {
		const instrumented = createComponent(SearchView, {
			animationsEnabled: true,
			gridColumns: 3,
			imageCache: stubImageCache,
			navigationController: makeNavigationController(),
			playbackStore: new PlaybackStore(),
			searchStore: makeSearchStore(),
			transport: {
				search: () => Promise.resolve({ albums: [], artists: [], playlists: [], tracks: [] }),
			},
		});
		const component = instrumented.getComponent();
		const textField = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.TextField,
		)[0];

		textField.getAttribute('onChange')?.('dream pop');

		expect(component.state.query).toBe('dream pop');
	});

	valdiIt('does not search when submit is empty and clears results', async () => {
		let calls = 0;
		const instrumented = createComponent(SearchView, {
			animationsEnabled: true,
			gridColumns: 3,
			imageCache: stubImageCache,
			navigationController: makeNavigationController(),
			playbackStore: new PlaybackStore(),
			searchStore: makeSearchStore(),
			transport: {
				search: () => {
					calls += 1;
					return Promise.resolve({ albums: [], artists: [], playlists: [], tracks: [] });
				},
			},
		});
		const component = instrumented.getComponent();
		component.setState({
			results: {
				albums: [{ artistId: 'a', artistName: 'a', id: 'a', name: 'a' }],
				artists: [],
				playlists: [],
				tracks: [],
			},
			status: 'success',
		});

		component.handleSubmitSearch('   ');
		await flushAsyncWork();

		expect(calls).toBe(0);
		expect(component.state.status).toBe('idle');
		expect(component.state.results.albums).toEqual([]);
	});

	valdiIt('submits search and stores recent terms', async () => {
		const searchCalls = [];
		const instrumented = createComponent(SearchView, {
			animationsEnabled: true,
			gridColumns: 3,
			imageCache: stubImageCache,
			navigationController: makeNavigationController(),
			playbackStore: new PlaybackStore(),
			searchStore: makeSearchStore(),
			transport: {
				search: (query: string) => {
					searchCalls.push(query);
					return Promise.resolve({
						albums: [
							{ artistId: 'artist-1', artistName: 'Converge', id: 'album-1', name: 'Jane Doe' },
						],
						artists: [],
						playlists: [],
						tracks: [{ duration: 123, id: 'track-1', name: 'Jane Doe' }],
					});
				},
			},
		});
		const component = instrumented.getComponent();

		component.handleSubmitSearch('jane');
		expect(component.state.status).toBe('loading');
		await flushAsyncWork();

		expect(searchCalls).toEqual(['jane']);
		expect(component.state.status).toBe('success');
		expect(component.state.recentSearches[0]).toBe('jane');
	});

	valdiIt('submits search from keyboard return', async () => {
		const searchCalls = [];
		const instrumented = createComponent(SearchView, {
			animationsEnabled: true,
			gridColumns: 3,
			imageCache: stubImageCache,
			navigationController: makeNavigationController(),
			playbackStore: new PlaybackStore(),
			searchStore: makeSearchStore(),
			transport: {
				search: (query: string) => {
					searchCalls.push(query);
					return Promise.resolve({ albums: [], artists: [], playlists: [], tracks: [] });
				},
			},
		});
		const component = instrumented.getComponent();
		component.setState({ query: 'burial' });
		const textField = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.TextField,
		)[0];

		textField.getAttribute('onReturn')?.();
		await flushAsyncWork();

		expect(searchCalls).toEqual(['burial']);
	});

	valdiIt('accepts event-shaped submit payloads', async () => {
		const searchCalls = [];
		const instrumented = createComponent(SearchView, {
			animationsEnabled: true,
			gridColumns: 3,
			imageCache: stubImageCache,
			navigationController: makeNavigationController(),
			playbackStore: new PlaybackStore(),
			searchStore: makeSearchStore(),
			transport: {
				search: (query: string) => {
					searchCalls.push(query);
					return Promise.resolve({ albums: [], artists: [], playlists: [], tracks: [] });
				},
			},
		});
		const component = instrumented.getComponent();

		component.handleSubmitSearch({ nativeEvent: { text: 'shoegaze' } });
		await flushAsyncWork();

		expect(searchCalls).toEqual(['shoegaze']);
		expect(component.state.lastSubmittedQuery).toBe('shoegaze');
	});

	valdiIt('opens artist/album/playlist views from tapped cards', () => {
		const navigationController = makeNavigationController();
		const instrumented = createComponent(SearchView, {
			animationsEnabled: true,
			gridColumns: 3,
			imageCache: stubImageCache,
			navigationController,
			playbackStore: new PlaybackStore(),
			searchStore: makeSearchStore(),
			transport: {
				search: () => Promise.resolve({ albums: [], artists: [], playlists: [], tracks: [] }),
			},
		});
		const component = instrumented.getComponent();

		component.setState({
			results: {
				albums: [{ artistId: 'artist-1', artistName: 'Converge', id: 'album-1', name: 'Jane Doe' }],
				artists: [{ id: 'artist-1', name: 'Converge' }],
				playlists: [{ id: 'playlist-1', name: 'Converge Essentials' }],
				tracks: [],
			},
			status: 'success',
		});

		component.handleArtistTap('artist-1');
		expect(navigationController.getPushed().component).toBe(ArtistView);

		component.handleAlbumTap('album-1');
		expect(navigationController.getPushed().component).toBe(AlbumView);

		component.handlePlaylistTap('playlist-1');
		expect(navigationController.getPushed().component).toBe(PlaylistView);
	});

	valdiIt('routes album/artist/playlist taps through app callback when provided', () => {
		const routed = [];
		const instrumented = createComponent(SearchView, {
			animationsEnabled: true,
			gridColumns: 3,
			imageCache: stubImageCache,
			navigationController: makeNavigationController(),
			onNavigateToLibraryResult: (target) => routed.push(target),
			playbackStore: new PlaybackStore(),
			searchStore: makeSearchStore(),
			transport: {
				search: () => Promise.resolve({ albums: [], artists: [], playlists: [], tracks: [] }),
			},
		});
		const component = instrumented.getComponent();

		component.setState({
			results: {
				albums: [{ artistId: 'artist-1', artistName: 'Converge', id: 'album-1', name: 'Jane Doe' }],
				artists: [{ id: 'artist-1', name: 'Converge' }],
				playlists: [{ id: 'playlist-1', name: 'Converge Essentials' }],
				tracks: [],
			},
			status: 'success',
		});

		component.handleAlbumTap('album-1');
		component.handleArtistTap('artist-1');
		component.handlePlaylistTap('playlist-1');

		expect(routed.map((entry) => entry.kind)).toEqual(['album', 'artist', 'playlist']);
	});

	valdiIt('plays only the tapped track from track list results', () => {
		const playbackStore = new PlaybackStore();
		const instrumented = createComponent(SearchView, {
			animationsEnabled: true,
			gridColumns: 3,
			imageCache: stubImageCache,
			navigationController: makeNavigationController(),
			playbackStore,
			searchStore: makeSearchStore(),
			transport: {
				getArtistLogoUrl: () => Promise.resolve(null),
				search: () => Promise.resolve({ albums: [], artists: [], playlists: [], tracks: [] }),
			},
		});
		const component = instrumented.getComponent();
		component.setState({
			results: {
				albums: [],
				artists: [],
				playlists: [],
				tracks: [
					{ duration: 111, id: 'track-1', name: 'First' },
					{ duration: 222, id: 'track-2', name: 'Second' },
				],
			},
			status: 'success',
		});

		component.handleTrackTap('track-2');

		expect(playbackStore.track?.id).toBe('track-2');
		expect(playbackStore.tracks.map((track) => track.id)).toEqual(['track-2']);
		expect(playbackStore.isPlaying).toBe(true);
	});

	valdiIt('renders search bar with accessibility labels', () => {
		const instrumented = createComponent(SearchView, {
			animationsEnabled: true,
			gridColumns: 3,
			imageCache: stubImageCache,
			navigationController: makeNavigationController(),
			playbackStore: new PlaybackStore(),
			searchStore: makeSearchStore(),
			transport: {
				search: () => Promise.resolve({ albums: [], artists: [], playlists: [], tracks: [] }),
			},
		});
		const component = instrumented.getComponent();
		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const searchBar = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'search-bar',
		);

		expect(searchBar).toBeTruthy();
		expect(searchBar?.getAttribute('contentDescription')).toBe('search-bar');
	});
});
