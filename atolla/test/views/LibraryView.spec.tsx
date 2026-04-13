// @ts-nocheck
import 'jasmine/src/jasmine';
import { PlaybackStore } from 'atolla/src/stores/Playback';
import { HeaderTabs } from 'atolla/src/ui/components/HeaderTabs';
import { LibraryView } from 'atolla/src/ui/views/LibraryView';
import { createComponent, valdiIt } from 'valdi_test/test/JSXTestUtils';

const stubImageCache = {
	get: () => null,
	getOrLoad: () => null,
	prefetch: () => Promise.resolve(),
	subscribe: () => () => {},
};

const stubTransport = {
	getAlbumsByArtist: () => Promise.resolve([]),
	getAllAlbums: () => Promise.resolve([]),
	getAllArtists: () => Promise.resolve([]),
	getAllPlaylists: () => Promise.resolve([]),
	getArtist: () => Promise.resolve(null),
	getArtistLogoUrl: () => Promise.resolve(null),
	getArtistTopTracks: () => Promise.resolve([]),
	getTracksByAlbum: () => Promise.resolve([]),
	getTracksByArtist: () => Promise.resolve([]),
	getTracksByPlaylist: () => Promise.resolve([]),
	search: () => Promise.resolve({ albums: [], artists: [], playlists: [], tracks: [] }),
};

describe('LibraryView', () => {
	valdiIt('uses active tab from view model', () => {
		const instrumented = createComponent(LibraryView, {
			activeTab: HeaderTabs.albums,
			animationsEnabled: true,
			gridColumns: 3,
			imageCache: stubImageCache,
			playbackStore: new PlaybackStore(),
			resetSignal: 0,
			transport: stubTransport,
		});
		const component = instrumented.getComponent();

		expect(component.viewModel.activeTab).toBe(HeaderTabs.albums);
	});

	valdiIt('starts with navigation overlay visible', () => {
		const instrumented = createComponent(LibraryView, {
			activeTab: HeaderTabs.artists,
			animationsEnabled: true,
			gridColumns: 3,
			imageCache: stubImageCache,
			playbackStore: new PlaybackStore(),
			resetSignal: 0,
			transport: stubTransport,
		});
		const component = instrumented.getComponent();

		expect(component.state.isNavigationMounted).toBe(false);
		expect(component.state.isTabTransitionOverlayVisible).toBe(true);
	});
});
