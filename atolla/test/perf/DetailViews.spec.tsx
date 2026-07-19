import 'jasmine/src/jasmine';
import { Preferences } from 'atolla/src/stores/Preferences';
import { AlbumView } from 'atolla/src/ui/views/AlbumView';
import { ArtistView } from 'atolla/src/ui/views/ArtistView';
import { GenreView } from 'atolla/src/ui/views/GenreView';
import { PlaylistView } from 'atolla/src/ui/views/PlaylistView';
import { makeTestViewCache } from 'atolla/test/util/viewCache';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';
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

function makePreferences(): Preferences {
	return new Preferences({ fetchString: async () => '', storeString: async () => {} });
}

async function flushAsyncWork() {
	for (let i = 0; i < 10; i += 1) {
		await Promise.resolve();
	}
}

// each detail view bumps `revision` when preferences change, to re-read gridColumns and friends.
// the track data is untouched by that bump, so TrackList should be visited and bypassed
describe('detail view render identity', () => {
	valdiIt('PlaylistView bypasses the track list on a preference bump', async (driver) => {
		const component = driver.renderComponent(
			PlaylistView,
			{
				downloadService,
				imageCache: stubImageCache,
				onRootDetailControllerReady: () => {},
				playbackStore,
				playlist: { id: 'playlist-1', name: 'Roadtrip' },
				preferences: makePreferences(),
				transport: {
					getPlaylist: async () => ({ id: 'playlist-1', name: 'Roadtrip' }),
					getTracksByPlaylist: async () => ({ hasMore: false, items: tracks, totalCount: 2 }),
				},
				viewCache: makeTestViewCache(),
			},
			{ navigator: mockNavigator },
		);
		await flushAsyncWork();
		expect(component.state.tracks.length).toBe(2);

		const stats = attachRenderStats(component);
		component.setState({ revision: component.state.revision + 1 });
		await flushAsyncWork();

		expect(stats.visits('TrackList')).toBe(1);
		expect(stats.renders('TrackList')).toBe(0);
	});

	valdiIt('GenreView bypasses the track list on a preference bump', async (driver) => {
		const component = driver.renderComponent(
			GenreView,
			{
				downloadService,
				genre: { id: 'genre-1', name: 'Hardcore' },
				imageCache: stubImageCache,
				onRootDetailControllerReady: () => {},
				playbackStore,
				preferences: makePreferences(),
				transport: {
					getGenre: async () => ({ id: 'genre-1', name: 'Hardcore' }),
					getTracksByGenre: async () => ({ hasMore: false, items: tracks, totalCount: 2 }),
				},
				viewCache: makeTestViewCache(),
			},
			{ navigator: mockNavigator },
		);
		await flushAsyncWork();
		expect(component.state.tracks.length).toBe(2);

		const stats = attachRenderStats(component);
		component.setState({ revision: component.state.revision + 1 });
		await flushAsyncWork();

		expect(stats.visits('TrackList')).toBe(1);
		expect(stats.renders('TrackList')).toBe(0);
	});

	valdiIt('AlbumView bypasses the track list on a preference bump', async (driver) => {
		const album = { artistId: 'artist-1', artistName: 'Converge', id: 'album-1', name: 'Jane Doe' };
		const component = driver.renderComponent(
			AlbumView,
			{
				album,
				downloadService,
				imageCache: stubImageCache,
				onRootDetailControllerReady: () => {},
				playbackStore,
				preferences: makePreferences(),
				transport: {
					getAlbumsByIds: async () => [album],
					getArtist: async () => ({ id: 'artist-1', name: 'Converge' }),
					getArtistLogoUrl: async () => null,
					getTracksByAlbum: async () => tracks,
				},
				viewCache: makeTestViewCache(),
			},
			{ navigator: mockNavigator },
		);
		await flushAsyncWork();
		expect(component.state.tracks.length).toBe(2);

		const stats = attachRenderStats(component);
		component.setState({ revision: component.state.revision + 1 });
		await flushAsyncWork();

		expect(stats.visits('TrackList')).toBe(1);
		expect(stats.renders('TrackList')).toBe(0);
	});

	valdiIt('ArtistView bypasses its cards and tracks on a preference bump', async (driver) => {
		const artist = { id: 'artist-1', name: 'Converge' };
		const albums = [
			{ artistId: 'artist-1', artistName: 'Converge', id: 'album-1', name: 'Jane Doe' },
		];
		const component = driver.renderComponent(
			ArtistView,
			{
				artist,
				downloadService,
				imageCache: stubImageCache,
				onRootDetailControllerReady: () => {},
				playbackStore,
				preferences: makePreferences(),
				transport: {
					getAlbumsByArtist: async () => albums,
					getArtist: async () => artist,
					getArtistLogoUrl: async () => null,
					getArtistTopTracks: async () => tracks,
					getTracksByArtist: async () => tracks,
				},
				viewCache: makeTestViewCache(),
			},
			{ navigator: mockNavigator },
		);
		await flushAsyncWork();
		expect(component.state.albums.length).toBe(1);

		const stats = attachRenderStats(component);
		component.setState({ revision: component.state.revision + 1 });
		await flushAsyncWork();

		expect(stats.visits('CardGrid')).toBe(1);
		expect(stats.visits('TrackList')).toBe(1);
		expect(stats.renders('CardGrid')).toBe(0);
		expect(stats.renders('TrackList')).toBe(0);
	});
});
