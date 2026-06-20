import 'jasmine/src/jasmine';
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

describe('PlaylistView', () => {
	valdiIt('renders track rows from state', async (driver) => {
		const playlist = { id: 'playlist-1', name: 'Roadtrip' };
		const tracks = [
			{ artistName: 'Artist One', duration: 120, id: 'track-1', name: 'Song One' },
			{ artistName: 'Artist Two', duration: 90, id: 'track-2', name: 'Song Two' },
		];
		const transport = {
			getTracksByPlaylist: async () => tracks,
		};

		const component = driver.renderComponent(
			PlaylistView,
			{ downloadService, playbackStore, playlist, transport },
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
			getTracksByPlaylist: async () => [
				{ artistName: 'Artist One', duration: 60, id: 'track-1', name: 'Song One' },
				{ artistName: 'Artist Two', duration: 75, id: 'track-2', name: 'Song Two' },
			],
		};

		const component = driver.renderComponent(
			PlaylistView,
			{ downloadService, playbackStore, playlist, transport },
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
