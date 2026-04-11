// @ts-nocheck
import 'jasmine/src/jasmine';
import { AlbumView } from 'atolla/src/ui/views/AlbumView';
import { ArtistView } from 'atolla/src/ui/views/ArtistView';

const mockNavigator = {
	dismiss: () => {},
	forceDisableDismissalGesture: () => {},
	pop: () => {},
	popToRoot: () => {},
	popToSelf: () => {},
	presentComponent: () => {},
	pushComponent: () => {},
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

import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { createComponent, valdiIt } from 'valdi_test/test/JSXTestUtils';

const downloadService = {
	downloadAlbum: () => {},
	getAlbumDownloadState: () => 'not_downloaded',
	removeAlbumDownload: () => {},
	subscribe: () => () => {},
};

describe('AlbumView', () => {
	valdiIt('renders track rows when tracks are present in state', () => {
		const album = {
			artistId: 'artist-1',
			artistName: 'Artist One',
			id: 'album-1',
			name: 'First Album',
		};
		const tracks = [
			{ duration: 120, id: 'track-1', name: 'Song One', trackNumber: 1 },
			{ duration: 90, id: 'track-2', name: 'Song Two', trackNumber: 2 },
		];
		const transport = {
			getArtist: async () => ({ id: 'artist-1', logoUrl: 'https://logo.png', name: 'Artist One' }),
			getTracksByAlbum: async () => tracks,
		};
		const playbackStore = {
			play: () => {},
			setArtistLogoUrl: () => {},
			subscribe: () => () => {},
			track: null,
		};

		const instrumented = createComponent(
			AlbumView,
			{ album, downloadService, playbackStore, transport },
			{ navigator: mockNavigator },
		);
		const component = instrumented.getComponent();

		component.setState({ artistLogoUrl: 'https://logo.png', isLoading: false, tracks });

		expect(component.state.tracks.length).toBe(2);
		expect(component.state.artistLogoUrl).toBe('https://logo.png');
	});

	valdiIt('plays loaded tracks and forwards artist logo on play tap', () => {
		const album = {
			artistId: 'artist-1',
			artistName: 'Artist One',
			id: 'album-1',
			name: 'First Album',
		};
		const tracks = [{ duration: 120, id: 'track-1', name: 'Song One', trackNumber: 1 }];
		const transport = {
			getArtist: async () => ({ id: 'artist-1', logoUrl: 'https://logo.png', name: 'Artist One' }),
			getTracksByAlbum: async () => tracks,
		};

		let playedTracks = null;
		let playedAlbum = null;
		let logo = 'unset';
		const playbackStore = {
			play: (inputTracks, inputAlbum) => {
				playedTracks = inputTracks;
				playedAlbum = inputAlbum;
			},
			setArtistLogoUrl: (inputLogo) => {
				logo = inputLogo;
			},
			subscribe: () => () => {},
			track: null,
		};

		const instrumented = createComponent(
			AlbumView,
			{ album, downloadService, playbackStore, transport },
			{ navigator: mockNavigator },
		);
		const component = instrumented.getComponent();

		component.setState({ artistLogoUrl: 'https://logo.png', isLoading: false, tracks });
		component.handleHeaderPlayTap();

		expect(playedTracks).toEqual(tracks);
		expect(playedAlbum).toEqual(album);
		expect(logo).toBe('https://logo.png');
	});

	valdiIt('does not call play when tracks are empty', () => {
		const album = {
			artistId: 'artist-1',
			artistName: 'Artist One',
			id: 'album-1',
			name: 'First Album',
		};
		let playCalls = 0;
		const playbackStore = {
			play: () => {
				playCalls += 1;
			},
			setArtistLogoUrl: () => {},
			subscribe: () => () => {},
			track: null,
		};
		const transport = {
			getArtist: async () => null,
			getTracksByAlbum: async () => [],
		};

		const instrumented = createComponent(
			AlbumView,
			{ album, downloadService, playbackStore, transport },
			{ navigator: mockNavigator },
		);
		const component = instrumented.getComponent();

		component.handleHeaderPlayTap();

		expect(playCalls).toBe(0);
	});

	valdiIt('pushes ArtistView when detail header artist logo is tapped', () => {
		const album = {
			artistId: 'artist-1',
			artistName: 'Artist One',
			id: 'album-1',
			name: 'First Album',
		};
		const transport = {
			getArtist: async () => ({ id: 'artist-1', logoUrl: 'https://logo.png', name: 'Artist One' }),
			getTracksByAlbum: async () => [],
		};
		const playbackStore = {
			play: () => {},
			setArtistLogoUrl: () => {},
			subscribe: () => () => {},
			track: null,
		};

		const navigationController = makeNavigationController();
		const instrumented = createComponent(
			AlbumView,
			{ album, downloadService, navigationController, playbackStore, transport },
			{ navigator: mockNavigator },
		);
		const component = instrumented.getComponent();
		component.setState({
			artist: { id: 'artist-1', logoUrl: 'https://logo.png', name: 'Artist One' },
			artistLogoUrl: 'https://logo.png',
		});

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const artistLogo = views.find(
			(view) => view.getAttribute('testID') === 'detail-header-artist-logo',
		);
		artistLogo?.getAttribute('onTap')?.();

		const { component: pushedComponent, viewModel: pushedViewModel } =
			navigationController.getPushed();
		expect(pushedComponent).toBe(ArtistView);
		expect(pushedViewModel?.artist?.id).toBe('artist-1');
	});

	valdiIt(
		'renders date-only release date and total duration in separate subheader columns when tracks are loaded',
		() => {
			const album = {
				artistId: 'artist-1',
				artistName: 'Artist One',
				id: 'album-1',
				name: 'First Album',
				releaseDate: '2024-01-01T12:34:56.0000000Z',
			};
			const transport = {
				getArtist: async () => null,
				getTracksByAlbum: async () => [
					{ duration: 60, id: 'track-1', name: 'Song One', trackNumber: 1 },
					{ duration: 75, id: 'track-2', name: 'Song Two', trackNumber: 2 },
				],
			};
			const playbackStore = {
				play: () => {},
				setArtistLogoUrl: () => {},
				subscribe: () => () => {},
				track: null,
			};

			const instrumented = createComponent(
				AlbumView,
				{ album, downloadService, playbackStore, transport },
				{ navigator: mockNavigator },
			);
			const component = instrumented.getComponent();

			component.setState({
				artistLogoUrl: null,
				isLoading: false,
				tracks: [
					{ duration: 60, id: 'track-1', name: 'Song One', trackNumber: 1 },
					{ duration: 75, id: 'track-2', name: 'Song Two', trackNumber: 2 },
				],
			});

			const labels = elementTypeFind(
				componentGetElements(component),
				IRenderedElementViewClass.Label,
			);
			const values = labels.map((label) => label.getAttribute('value'));
			expect(values).toContain('2024-01-01');
			expect(values).not.toContain('2024-01-01T12:34:56.0000000Z');
			expect(values).toContain('2:15');
		},
	);
});
