import 'jasmine/src/jasmine';
import { PlaybackStore } from 'atolla/src/stores/Playback';
import { Preferences } from 'atolla/src/stores/Preferences';
import { AlbumsView } from 'atolla/src/ui/views/AlbumsView';
import { AlbumView } from 'atolla/src/ui/views/AlbumView';
import { ArtistsView } from 'atolla/src/ui/views/ArtistsView';
import { ArtistView } from 'atolla/src/ui/views/ArtistView';
import { GenresView } from 'atolla/src/ui/views/GenresView';
import { GenreView } from 'atolla/src/ui/views/GenreView';
import { PlaylistsView } from 'atolla/src/ui/views/PlaylistsView';
import { PlaylistView } from 'atolla/src/ui/views/PlaylistView';
import { makeTestViewCache } from 'atolla/test/util/viewCache';
import { InstrumentedComponentJSX, valdiIt } from 'valdi_test/test/JSXTestUtils';
import { attachRenderStats } from '../util/renderStats';

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
	getAlbumDownloadState: () => 'not_downloaded',
	getArtistDownloadState: () => 'not_downloaded',
	getGenreDownloadState: () => 'not_downloaded',
	getPlaylistDownloadState: () => 'not_downloaded',
	subscribe: () => () => {},
};

const playbackStore = {
	subscribe: () => () => {},
	track: null,
};

const stubImageCache = {
	get: () => null,
	getOrLoad: () => null,
	prefetch: () => Promise.resolve(),
	subscribe: () => () => {},
};

const tracks = [
	{
		albumName: 'Jane Doe',
		artistName: 'Converge',
		duration: 123,
		id: 'track-1',
		name: 'Concubine',
	},
	{
		albumName: 'Jane Doe',
		artistName: 'Converge',
		duration: 231,
		id: 'track-2',
		name: 'Fault Line',
	},
];

async function flushAsyncWork() {
	for (let i = 0; i < 10; i += 1) {
		await Promise.resolve();
	}
}

function makePreferences(): Preferences {
	return new Preferences({ fetchString: async () => '', storeString: async () => {} });
}

function makeLibraryViewModel(transport: Record<string, unknown>) {
	return {
		imageCache: stubImageCache,
		isOfflineMode: false,
		navigationController: { push: () => {} },
		playbackStore: new PlaybackStore(),
		preferences: makePreferences(),
		transport,
		viewCache: makeTestViewCache(),
	};
}

function makeDetailViewModel(transport: Record<string, unknown>) {
	return {
		downloadService,
		imageCache: stubImageCache,
		onRootDetailControllerReady: () => {},
		playbackStore,
		preferences: makePreferences(),
		transport,
		viewCache: makeTestViewCache(),
	};
}

// a callback allocated inside onRender is a fresh reference every pass, so the child it is handed
// to can never bypass. the library grids only expose this when there is another page to load —
// with hasMore false both load-more props are undefined, which compares equal for free.
describe('library grid callback identity', () => {
	valdiIt('AlbumsView bypasses the grid while more pages remain', async () => {
		const albums = [
			{ artistId: 'artist-1', artistName: 'Converge', id: 'album-1', name: 'Jane Doe' },
		];
		const component = InstrumentedComponentJSX.create(
			AlbumsView,
			makeLibraryViewModel({ getAlbums: async () => ({ hasMore: true, items: albums }) }),
			undefined,
		).getComponent();
		await flushAsyncWork();
		expect(component.state.hasMore).toBe(true);

		const stats = attachRenderStats(component);
		component.setState({ revision: component.state.revision + 1 });
		await flushAsyncWork();

		expect(stats.visits('CardGrid')).toBe(1);
		expect(stats.renders('CardGrid')).toBe(0);
	});

	valdiIt('ArtistsView bypasses the grid while more pages remain', async () => {
		const artists = [{ id: 'artist-1', name: 'Converge' }];
		const component = InstrumentedComponentJSX.create(
			ArtistsView,
			makeLibraryViewModel({ getArtists: async () => ({ hasMore: true, items: artists }) }),
			undefined,
		).getComponent();
		await flushAsyncWork();
		expect(component.state.hasMore).toBe(true);

		const stats = attachRenderStats(component);
		component.setState({ revision: component.state.revision + 1 });
		await flushAsyncWork();

		expect(stats.visits('CardGrid')).toBe(1);
		expect(stats.renders('CardGrid')).toBe(0);
	});

	valdiIt('GenresView bypasses the grid while more pages remain', async () => {
		const genres = [{ id: 'genre-1', name: 'Hardcore' }];
		const component = InstrumentedComponentJSX.create(
			GenresView,
			makeLibraryViewModel({ getGenres: async () => ({ hasMore: true, items: genres }) }),
			undefined,
		).getComponent();
		await flushAsyncWork();
		expect(component.state.hasMore).toBe(true);

		const stats = attachRenderStats(component);
		component.setState({ revision: component.state.revision + 1 });
		await flushAsyncWork();

		expect(stats.visits('CardGrid')).toBe(1);
		expect(stats.renders('CardGrid')).toBe(0);
	});

	valdiIt('PlaylistsView bypasses the grid while more pages remain', async () => {
		const playlists = [{ id: 'playlist-1', name: 'Heavy' }];
		const component = InstrumentedComponentJSX.create(
			PlaylistsView,
			makeLibraryViewModel({ getPlaylists: async () => ({ hasMore: true, items: playlists }) }),
			undefined,
		).getComponent();
		await flushAsyncWork();
		expect(component.state.hasMore).toBe(true);

		const stats = attachRenderStats(component);
		component.setState({ revision: component.state.revision + 1 });
		await flushAsyncWork();

		expect(stats.visits('CardGrid')).toBe(1);
		expect(stats.renders('CardGrid')).toBe(0);
	});
});

// every detail view drives its collapsing header from RefreshableScroll's onScroll. that handler
// wraps the whole scrollable body, so a fresh reference re-renders the scroll shell and its
// spinner on any unrelated parent setState
describe('detail view callback identity', () => {
	valdiIt('AlbumView bypasses the scroll shell on a preference bump', async (driver) => {
		const album = { artistId: 'artist-1', artistName: 'Converge', id: 'album-1', name: 'Jane Doe' };
		const component = driver.renderComponent(
			AlbumView,
			{
				...makeDetailViewModel({
					getAlbumsByIds: async () => [album],
					getArtist: async () => ({ id: 'artist-1', name: 'Converge' }),
					getArtistLogoUrl: async () => null,
					getTracksByAlbum: async () => tracks,
				}),
				album,
			},
			{ navigator: mockNavigator },
		);
		await flushAsyncWork();
		expect(component.state.tracks.length).toBe(2);

		const stats = attachRenderStats(component);
		component.setState({ revision: component.state.revision + 1 });
		await flushAsyncWork();

		expect(stats.visits('RefreshableScroll')).toBe(1);
		expect(stats.renders('RefreshableScroll')).toBe(0);
	});

	valdiIt('ArtistView bypasses the scroll shell on a preference bump', async (driver) => {
		const artist = { id: 'artist-1', name: 'Converge' };
		const albums = [
			{ artistId: 'artist-1', artistName: 'Converge', id: 'album-1', name: 'Jane Doe' },
		];
		const component = driver.renderComponent(
			ArtistView,
			{
				...makeDetailViewModel({
					getAlbumsByArtist: async () => albums,
					getArtist: async () => artist,
					getArtistLogoUrl: async () => null,
					getArtistTopTracks: async () => tracks,
					getTracksByArtist: async () => tracks,
				}),
				artist,
			},
			{ navigator: mockNavigator },
		);
		await flushAsyncWork();
		expect(component.state.albums.length).toBe(1);

		const stats = attachRenderStats(component);
		component.setState({ revision: component.state.revision + 1 });
		await flushAsyncWork();

		expect(stats.visits('RefreshableScroll')).toBe(1);
		expect(stats.renders('RefreshableScroll')).toBe(0);
	});

	valdiIt('GenreView bypasses the scroll shell on a preference bump', async (driver) => {
		const component = driver.renderComponent(
			GenreView,
			{
				...makeDetailViewModel({
					getGenre: async () => ({ id: 'genre-1', name: 'Hardcore' }),
					getTracksByGenre: async () => ({ hasMore: false, items: tracks, totalCount: 2 }),
				}),
				genre: { id: 'genre-1', name: 'Hardcore' },
			},
			{ navigator: mockNavigator },
		);
		await flushAsyncWork();
		expect(component.state.tracks.length).toBe(2);

		const stats = attachRenderStats(component);
		component.setState({ revision: component.state.revision + 1 });
		await flushAsyncWork();

		expect(stats.visits('RefreshableScroll')).toBe(1);
		expect(stats.renders('RefreshableScroll')).toBe(0);
	});

	valdiIt('PlaylistView bypasses the scroll shell on a preference bump', async (driver) => {
		const component = driver.renderComponent(
			PlaylistView,
			{
				...makeDetailViewModel({
					getPlaylist: async () => ({ id: 'playlist-1', name: 'Roadtrip' }),
					getTracksByPlaylist: async () => ({ hasMore: false, items: tracks, totalCount: 2 }),
				}),
				playlist: { id: 'playlist-1', name: 'Roadtrip' },
			},
			{ navigator: mockNavigator },
		);
		await flushAsyncWork();
		expect(component.state.tracks.length).toBe(2);

		const stats = attachRenderStats(component);
		component.setState({ revision: component.state.revision + 1 });
		await flushAsyncWork();

		expect(stats.visits('RefreshableScroll')).toBe(1);
		expect(stats.renders('RefreshableScroll')).toBe(0);
	});
});
