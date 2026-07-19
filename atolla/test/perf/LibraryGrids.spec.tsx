import 'jasmine/src/jasmine';
import { PlaybackStore } from 'atolla/src/stores/Playback';
import { Preferences } from 'atolla/src/stores/Preferences';
import { AlbumsView } from 'atolla/src/ui/views/AlbumsView';
import { ArtistsView } from 'atolla/src/ui/views/ArtistsView';
import { GenresView } from 'atolla/src/ui/views/GenresView';
import { PlaylistsView } from 'atolla/src/ui/views/PlaylistsView';
import { makeTestViewCache } from 'atolla/test/util/viewCache';
import { InstrumentedComponentJSX, valdiIt } from 'valdi_test/test/JSXTestUtils';
import { attachRenderStats } from '../util/renderStats';

const stubImageCache = {
	get: () => null,
	getOrLoad: () => null,
	prefetch: () => Promise.resolve(),
	subscribe: () => () => {},
};

async function flushAsyncWork() {
	await Promise.resolve();
	await Promise.resolve();
}

function makePreferences(): Preferences {
	return new Preferences({ fetchString: async () => '', storeString: async () => {} });
}

function makeViewModel(transport: Record<string, unknown>) {
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

// every library grid subscribes to preferences and bumps `revision` to force a re-read of
// non-state values like gridColumns. that bump is correct, but it must not re-derive the card
// array: the grid data is unchanged, so CardGrid should be visited and bypassed, not re-rendered
describe('library grid render identity', () => {
	valdiIt('AlbumsView bypasses the grid on a preference bump', async () => {
		const albums = [
			{ artistId: 'artist-1', artistName: 'Converge', id: 'album-1', name: 'Jane Doe' },
			{ artistId: 'artist-2', artistName: 'Botch', id: 'album-2', name: 'We Are the Romans' },
		];
		const component = InstrumentedComponentJSX.create(
			AlbumsView,
			makeViewModel({ getAlbums: async () => ({ hasMore: false, items: albums }) }),
			undefined,
		).getComponent();
		await flushAsyncWork();
		expect(component.state.albums.length).toBe(2);

		const stats = attachRenderStats(component);
		component.setState({ revision: component.state.revision + 1 });
		await flushAsyncWork();

		expect(stats.visits('CardGrid')).toBe(1);
		expect(stats.renders('CardGrid')).toBe(0);
	});

	valdiIt('ArtistsView bypasses the grid on a preference bump', async () => {
		const artists = [
			{ id: 'artist-1', name: 'Converge' },
			{ id: 'artist-2', name: 'Botch' },
		];
		const component = InstrumentedComponentJSX.create(
			ArtistsView,
			makeViewModel({ getArtists: async () => ({ hasMore: false, items: artists }) }),
			undefined,
		).getComponent();
		await flushAsyncWork();
		expect(component.state.artists.length).toBe(2);

		const stats = attachRenderStats(component);
		component.setState({ revision: component.state.revision + 1 });
		await flushAsyncWork();

		expect(stats.visits('CardGrid')).toBe(1);
		expect(stats.renders('CardGrid')).toBe(0);
	});

	valdiIt('GenresView bypasses the grid on a preference bump', async () => {
		const genres = [
			{ id: 'genre-1', name: 'Hardcore' },
			{ id: 'genre-2', name: 'Mathcore' },
		];
		const component = InstrumentedComponentJSX.create(
			GenresView,
			makeViewModel({ getGenres: async () => ({ hasMore: false, items: genres }) }),
			undefined,
		).getComponent();
		await flushAsyncWork();
		expect(component.state.genres.length).toBe(2);

		const stats = attachRenderStats(component);
		component.setState({ revision: component.state.revision + 1 });
		await flushAsyncWork();

		expect(stats.visits('CardGrid')).toBe(1);
		expect(stats.renders('CardGrid')).toBe(0);
	});

	valdiIt('PlaylistsView bypasses the grid on a preference bump', async () => {
		const playlists = [
			{ id: 'playlist-1', name: 'Heavy' },
			{ id: 'playlist-2', name: 'Light' },
		];
		const component = InstrumentedComponentJSX.create(
			PlaylistsView,
			makeViewModel({ getPlaylists: async () => ({ hasMore: false, items: playlists }) }),
			undefined,
		).getComponent();
		await flushAsyncWork();
		expect(component.state.playlists.length).toBe(2);

		const stats = attachRenderStats(component);
		component.setState({ revision: component.state.revision + 1 });
		await flushAsyncWork();

		expect(stats.visits('CardGrid')).toBe(1);
		expect(stats.renders('CardGrid')).toBe(0);
	});
});
