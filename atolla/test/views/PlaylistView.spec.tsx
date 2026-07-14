import 'jasmine/src/jasmine';
import { Preferences } from 'atolla/src/stores/Preferences';
import { PlaylistView } from 'atolla/src/ui/views/PlaylistView';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';

const mockNavigator = {
	dismiss: () => {},
	forceDisableDismissalGesture: () => {},
	pop: () => {},
	popToRoot: () => {},
	popToSelf: () => {},
	presentComponent: () => {},
	pushComponent: () => {},
};

const playbackStore = {
	subscribe: () => () => {},
	track: null,
};

const downloadService = {
	downloadPlaylist: () => {},
	getPlaylistDownloadState: () => 'not_downloaded',
	removePlaylistDownload: () => {},
	subscribe: () => () => {},
};

const preferences = new Preferences({ fetchString: async () => '', storeString: async () => {} });

async function flushAsyncWork() {
	for (let i = 0; i < 10; i += 1) {
		await Promise.resolve();
	}
}

const emptyTracksPage = async () => ({ hasMore: false, items: [], totalCount: 0 });

describe('PlaylistView', () => {
	valdiIt('self-heals the header image when the playlist has no imageUrl', async (driver) => {
		const playlist = { id: 'playlist-1', name: 'Roadtrip' };
		let getPlaylistCalls = 0;
		const transport = {
			getPlaylist: async () => {
				getPlaylistCalls += 1;
				return { id: 'playlist-1', imageUrl: 'https://p.png', name: 'Roadtrip' };
			},
			getTracksByPlaylist: emptyTracksPage,
		};

		const component = driver.renderComponent(
			PlaylistView,
			{
				downloadService,
				onRootDetailControllerReady: () => {},
				playbackStore,
				playlist,
				preferences,
				transport,
			},
			{ navigator: mockNavigator },
		);
		component.setState({ isLoading: false });

		await flushAsyncWork();

		expect(getPlaylistCalls).toBe(1);
		expect(component.state.hydratedPlaylist?.imageUrl).toBe('https://p.png');
	});

	valdiIt('does not fetch the playlist when it already has an image', async (driver) => {
		const playlist = { id: 'playlist-1', imageUrl: 'https://existing.png', name: 'Roadtrip' };
		let getPlaylistCalls = 0;
		const transport = {
			getPlaylist: async () => {
				getPlaylistCalls += 1;
				return null;
			},
			getTracksByPlaylist: emptyTracksPage,
		};

		const component = driver.renderComponent(
			PlaylistView,
			{
				downloadService,
				onRootDetailControllerReady: () => {},
				playbackStore,
				playlist,
				preferences,
				transport,
			},
			{ navigator: mockNavigator },
		);
		component.setState({ isLoading: false });

		await flushAsyncWork();

		expect(getPlaylistCalls).toBe(0);
		expect(component.state.hydratedPlaylist).toBeNull();
	});

	valdiIt('renders track rows from state', async (driver) => {
		const playlist = { id: 'playlist-1', name: 'Roadtrip' };
		const tracks = [
			{ artistName: 'Artist One', duration: 120, id: 'track-1', name: 'Song One' },
			{ artistName: 'Artist Two', duration: 90, id: 'track-2', name: 'Song Two' },
		];
		const transport = {
			getTracksByPlaylist: async () => ({
				hasMore: false,
				items: tracks,
				totalCount: tracks.length,
			}),
		};

		const component = driver.renderComponent(
			PlaylistView,
			{
				downloadService,
				onRootDetailControllerReady: () => {},
				playbackStore,
				playlist,
				preferences,
				transport,
			},
			{ navigator: mockNavigator },
		);
		component.setState({ isLoading: false, tracks });

		expect(component.state.tracks.length).toBe(2);
		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		const values = labels.map((label) => label.getAttribute('value'));
		expect(values).toContain('Song One');
		expect(values).toContain('Song Two');
	});

	valdiIt('renders track count and total duration in header', async (driver) => {
		const playlist = { id: 'playlist-1', name: 'Roadtrip' };
		const transport = {
			getTracksByPlaylist: async () => ({
				hasMore: false,
				items: [
					{ artistName: 'Artist One', duration: 60, id: 'track-1', name: 'Song One' },
					{ artistName: 'Artist Two', duration: 75, id: 'track-2', name: 'Song Two' },
				],
				totalCount: 2,
			}),
		};

		const component = driver.renderComponent(
			PlaylistView,
			{
				downloadService,
				onRootDetailControllerReady: () => {},
				playbackStore,
				playlist,
				preferences,
				transport,
			},
			{ navigator: mockNavigator },
		);
		component.setState({
			isLoading: false,
			tracks: [
				{ artistName: 'Artist One', duration: 60, id: 'track-1', name: 'Song One' },
				{ artistName: 'Artist Two', duration: 75, id: 'track-2', name: 'Song Two' },
			],
		});

		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		const values = labels.map((label) => label.getAttribute('value'));
		expect(values).toContain('2 tracks');
		expect(values).toContain('2:15');
	});
});
