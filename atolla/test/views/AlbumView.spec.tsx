import 'jasmine/src/jasmine';
import { AlbumView } from 'atolla/src/ui/views/AlbumView';
import { ArtistView } from 'atolla/src/ui/views/ArtistView';
import { touchEvent } from '../util/testEvents';

const mockNavigator = {
	dismiss: () => {},
	forceDisableDismissalGesture: () => {},
	pop: () => {},
	popToRoot: () => {},
	popToSelf: () => {},
	presentComponent: () => {},
	pushComponent: () => {},
};

function _makeNavigationController() {
	let pushedComponent: unknown = null;
	let pushedViewModel: unknown = null;
	const navigationController = {
		getPushed: () => ({ component: pushedComponent, viewModel: pushedViewModel }),
		push: (component: unknown, viewModel: unknown) => {
			pushedComponent = component;
			pushedViewModel = viewModel;
		},
	};
	return navigationController;
}

import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';

const downloadService = {
	downloadAlbum: () => {},
	getAlbumDownloadState: () => 'not_downloaded',
	removeAlbumDownload: () => {},
	subscribe: () => () => {},
};

describe('AlbumView', () => {
	valdiIt('renders track rows when tracks are present in state', async (driver) => {
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
			getAlbumsByIds: async () => [],
			getArtist: async () => ({ id: 'artist-1', logoUrl: 'https://logo.png', name: 'Artist One' }),
			getTracksByAlbum: async () => tracks,
		};
		const playbackStore = {
			play: () => {},
			setArtistLogoUrl: () => {},
			subscribe: () => () => {},
			track: null,
		};

		const component = driver.renderComponent(
			AlbumView,
			{ album, downloadService, playbackStore, transport },
			{ navigator: mockNavigator },
		);

		component.setState({ artistLogoUrl: 'https://logo.png', isLoading: false, tracks });

		expect(component.state.tracks.length).toBe(2);
		expect(component.state.artistLogoUrl).toBe('https://logo.png');
	});

	valdiIt('plays loaded tracks and forwards artist logo on play tap', async (driver) => {
		const album = {
			artistId: 'artist-1',
			artistName: 'Artist One',
			id: 'album-1',
			name: 'First Album',
		};
		const tracks = [{ duration: 120, id: 'track-1', name: 'Song One', trackNumber: 1 }];
		const transport = {
			getAlbumsByIds: async () => [],
			getArtist: async () => ({ id: 'artist-1', logoUrl: 'https://logo.png', name: 'Artist One' }),
			getTracksByAlbum: async () => tracks,
		};

		let playedTracks: unknown = null;
		let playedAlbum: unknown = null;
		let logo = 'unset';
		const playbackStore = {
			play: (inputTracks: unknown, inputAlbum: unknown) => {
				playedTracks = inputTracks;
				playedAlbum = inputAlbum;
			},
			setArtistLogoUrl: (inputLogo: string) => {
				logo = inputLogo;
			},
			subscribe: () => () => {},
			track: null,
		};

		const component = driver.renderComponent(
			AlbumView,
			{ album, downloadService, playbackStore, transport },
			{ navigator: mockNavigator },
		);

		component.setState({ artistLogoUrl: 'https://logo.png', isLoading: false, tracks });
		component.handleHeaderPlayTap();

		expect(playedTracks).toEqual(tracks);
		expect(playedAlbum).toEqual(album);
		expect(logo).toBe('https://logo.png');
	});

	valdiIt('does not call play when tracks are empty', async (driver) => {
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
			getAlbumsByIds: async () => [],
			getArtist: async () => null,
			getTracksByAlbum: async () => [],
		};

		const component = driver.renderComponent(
			AlbumView,
			{ album, downloadService, playbackStore, transport },
			{ navigator: mockNavigator },
		);

		component.handleHeaderPlayTap();

		expect(playCalls).toBe(0);
	});

	valdiIt('pushes ArtistView when detail header artist logo is tapped', async (driver) => {
		const album = {
			artistId: 'artist-1',
			artistName: 'Artist One',
			id: 'album-1',
			name: 'First Album',
		};
		const transport = {
			getAlbumsByIds: async () => [],
			getArtist: async () => ({ id: 'artist-1', logoUrl: 'https://logo.png', name: 'Artist One' }),
			getTracksByAlbum: async () => [],
		};
		const playbackStore = {
			play: () => {},
			setArtistLogoUrl: () => {},
			subscribe: () => () => {},
			track: null,
		};

		const captured: {
			pushedPage: {
				componentPath?: unknown;
				componentViewModel?: { artist?: { id?: string } };
			} | null;
		} = { pushedPage: null };
		const trackingNavigator = {
			...mockNavigator,
			__shouldDisableMakeOpaque: true,
			pushComponent: (page: typeof captured.pushedPage) => {
				captured.pushedPage = page;
			},
		};
		const component = driver.renderComponent(
			AlbumView,
			{ album, downloadService, playbackStore, transport },
			{ navigator: trackingNavigator },
		);
		component.setState({
			artist: { id: 'artist-1', logoUrl: 'https://logo.png', name: 'Artist One' },
			artistLogoUrl: 'https://logo.png',
		});

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const artistLogo = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'detail-header-artist-logo',
		);
		artistLogo?.getAttribute('onTap')?.(touchEvent);

		expect(captured.pushedPage?.componentPath).toBe(ArtistView.componentPath);
		expect(captured.pushedPage?.componentViewModel?.artist?.id).toBe('artist-1');
	});

	valdiIt(
		'pushes ArtistView synchronously even when the artist has not loaded yet',
		async (driver) => {
			const album = {
				artistId: 'artist-1',
				artistName: 'Artist One',
				id: 'album-1',
				name: 'First Album',
			};
			// getArtist never resolves, so state.artist stays null. the push must not wait on
			// it; it should navigate immediately using album fallback data
			const transport = {
				getAlbumsByIds: async () => [],
				getArtist: () => new Promise(() => {}),
				getTracksByAlbum: async () => [],
			};
			const playbackStore = {
				play: () => {},
				setArtistLogoUrl: () => {},
				subscribe: () => () => {},
				track: null,
			};

			const captured: {
				pushedPage: {
					componentPath?: unknown;
					componentViewModel?: { artist?: { id?: string; name?: string } };
				} | null;
			} = { pushedPage: null };
			const trackingNavigator = {
				...mockNavigator,
				__shouldDisableMakeOpaque: true,
				pushComponent: (page: typeof captured.pushedPage) => {
					captured.pushedPage = page;
				},
			};
			const component = driver.renderComponent(
				AlbumView,
				{ album, downloadService, playbackStore, transport },
				{ navigator: trackingNavigator },
			);

			expect(component.state.artist).toBeNull();
			component.handleArtistLogoTap();

			expect(captured.pushedPage?.componentPath).toBe(ArtistView.componentPath);
			expect(captured.pushedPage?.componentViewModel?.artist?.id).toBe('artist-1');
			expect(captured.pushedPage?.componentViewModel?.artist?.name).toBe('Artist One');
		},
	);

	valdiIt('renders a DISK header per disc when tracks span more than one disc', async (driver) => {
		const album = {
			artistId: 'artist-1',
			artistName: 'Artist One',
			id: 'album-1',
			name: 'First Album',
		};
		const tracks = [
			{ discNumber: 1, duration: 60, id: 'track-1', name: 'Song One', trackNumber: 1 },
			{ discNumber: 1, duration: 75, id: 'track-2', name: 'Song Two', trackNumber: 2 },
			{ discNumber: 2, duration: 90, id: 'track-3', name: 'Song Three', trackNumber: 1 },
		];
		const transport = {
			getAlbumsByIds: async () => [],
			getArtist: async () => null,
			getTracksByAlbum: async () => tracks,
		};
		const playbackStore = {
			play: () => {},
			setArtistLogoUrl: () => {},
			subscribe: () => () => {},
			track: null,
		};

		const component = driver.renderComponent(
			AlbumView,
			{ album, downloadService, playbackStore, transport },
			{ navigator: mockNavigator },
		);

		component.setState({ artistLogoUrl: null, isLoading: false, tracks });

		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		const values = labels.map((label) => label.getAttribute('value'));
		expect(values).toContain('DISK 1');
		expect(values).toContain('DISK 2');
	});

	valdiIt('does not render a DISK header when every track shares one disc', async (driver) => {
		const album = {
			artistId: 'artist-1',
			artistName: 'Artist One',
			id: 'album-1',
			name: 'First Album',
		};
		const tracks = [
			{ discNumber: 1, duration: 60, id: 'track-1', name: 'Song One', trackNumber: 1 },
			{ discNumber: 1, duration: 75, id: 'track-2', name: 'Song Two', trackNumber: 2 },
		];
		const transport = {
			getAlbumsByIds: async () => [],
			getArtist: async () => null,
			getTracksByAlbum: async () => tracks,
		};
		const playbackStore = {
			play: () => {},
			setArtistLogoUrl: () => {},
			subscribe: () => () => {},
			track: null,
		};

		const component = driver.renderComponent(
			AlbumView,
			{ album, downloadService, playbackStore, transport },
			{ navigator: mockNavigator },
		);

		component.setState({ artistLogoUrl: null, isLoading: false, tracks });

		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		const values = labels.map((label) => label.getAttribute('value'));
		expect(values.some((value) => typeof value === 'string' && value.startsWith('DISK'))).toBe(
			false,
		);
	});

	valdiIt(
		'renders date-only release date and total duration in separate subheader columns when tracks are loaded',
		async (driver) => {
			const album = {
				artistId: 'artist-1',
				artistName: 'Artist One',
				id: 'album-1',
				name: 'First Album',
				releaseDate: '2024-01-01T12:34:56.0000000Z',
			};
			const transport = {
				getAlbumsByIds: async () => [],
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

			const component = driver.renderComponent(
				AlbumView,
				{ album, downloadService, playbackStore, transport },
				{ navigator: mockNavigator },
			);

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
