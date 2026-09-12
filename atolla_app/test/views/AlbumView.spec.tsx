import 'jasmine/src/jasmine';
import { type AppServicesBag, appServices } from 'atolla_app/src/services/AppServices';
import { Preferences } from 'atolla_app/src/stores/Preferences';
import { AlbumView, type AlbumViewModel } from 'atolla_app/src/ui/views/AlbumView';
import { ArtistView } from 'atolla_app/src/ui/views/ArtistView';
import { setTestAppServices } from 'atolla_app/test/util/appServices';
import { makeTestViewCache } from 'atolla_app/test/util/viewCache';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { Component } from 'valdi_core/src/Component';
import { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { DetachedSlotRenderer } from 'valdi_core/src/slot/DetachedSlotRenderer';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';
import { touchEvent, touchEventWith } from '../util/testEvents';

class AlbumViewWithSlot extends Component<AlbumViewModel> {
	private slot = new DetachedSlot();

	onRender() {
		<view>
			<AlbumView {...this.viewModel} modalSlot={this.slot} />
			<DetachedSlotRenderer detachedSlot={this.slot} />
		</view>;
	}
}

function findByLabel(component: unknown, label: string) {
	return elementTypeFind(
		componentGetElements(component as never),
		IRenderedElementViewClass.View,
	).find((view) => view.getAttribute('accessibilityLabel') === label);
}

// renders resume awaiting test bodies mid-render, so a fixed flush count can observe a
// half-built tree; poll for the element instead
async function waitForLabel(component: unknown, label: string): Promise<void> {
	for (let i = 0; i < 50 && !findByLabel(component, label); i += 1) {
		await Promise.resolve();
	}
}

function longPressArtwork(component: unknown): void {
	jasmine.clock().install();
	try {
		findByLabel(component, 'detail-header-artwork')?.getAttribute('onTouch')?.(
			touchEventWith({ state: 0 }),
		);
		jasmine.clock().tick(500);
	} finally {
		jasmine.clock().uninstall();
	}
}

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
	downloadAlbum: () => {},
	getAlbumDownloadState: () => 'not_downloaded',
	removeAlbumDownload: () => {},
	subscribe: () => () => {},
};

const networkStatus = { getTransport: () => 'wifi', subscribe: () => () => {} };

const preferences = new Preferences({ fetchString: async () => '', storeString: async () => {} });

async function flushAsyncWork() {
	for (let i = 0; i < 10; i += 1) {
		await Promise.resolve();
	}
}

describe('AlbumView', () => {
	valdiIt(
		'self-heals a missing header image when the album has genres but no imageUrl',
		async (driver) => {
			const album = {
				artistId: 'artist-1',
				artistName: 'Artist One',
				genres: [],
				id: 'album-1',
				name: 'First Album',
			};
			let getAlbumsByIdsCalls = 0;
			const transport = {
				getAlbumsByIds: async () => {
					getAlbumsByIdsCalls += 1;
					return [{ ...album, imageUrl: 'https://art.png' }];
				},
				getArtist: async () => null,
				getTracksByAlbum: async () => [],
			};
			const playbackStore = {
				play: () => {},
				setArtistLogoUrl: () => {},
				subscribe: () => () => {},
				track: null,
			};

			const component = driver.renderComponent(
				AlbumView,
				{
					album,
					downloadService,
					networkStatus,
					playbackStore,
					preferences,
					transport,
					viewCache: makeTestViewCache(),
				},
				{ navigator: mockNavigator },
			);
			component.setState({ isLoading: false });

			await flushAsyncWork();

			expect(getAlbumsByIdsCalls).toBe(1);
			expect(component.state.fullAlbum?.imageUrl).toBe('https://art.png');
		},
	);

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
			{
				album,
				downloadService,
				networkStatus,
				playbackStore,
				preferences,
				transport,
				viewCache: makeTestViewCache(),
			},
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
			{
				album,
				downloadService,
				networkStatus,
				playbackStore,
				preferences,
				transport,
				viewCache: makeTestViewCache(),
			},
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
			{
				album,
				downloadService,
				networkStatus,
				playbackStore,
				preferences,
				transport,
				viewCache: makeTestViewCache(),
			},
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
			{
				album,
				downloadService,
				networkStatus,
				playbackStore,
				preferences,
				transport,
				viewCache: makeTestViewCache(),
			},
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
				{
					album,
					downloadService,
					networkStatus,
					playbackStore,
					preferences,
					transport,
					viewCache: makeTestViewCache(),
				},
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
			{
				album,
				downloadService,
				networkStatus,
				playbackStore,
				preferences,
				transport,
				viewCache: makeTestViewCache(),
			},
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
			{
				album,
				downloadService,
				networkStatus,
				playbackStore,
				preferences,
				transport,
				viewCache: makeTestViewCache(),
			},
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
				{
					album,
					downloadService,
					networkStatus,
					playbackStore,
					preferences,
					transport,
					viewCache: makeTestViewCache(),
				},
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

	describe('connection mode changes', () => {
		const album = {
			artistId: 'artist-1',
			artistName: 'Artist One',
			id: 'album-1',
			name: 'First Album',
		};
		const playbackStore = {
			play: () => {},
			setArtistLogoUrl: () => {},
			subscribe: () => () => {},
			track: null,
		};

		function offlineTransport() {
			return {
				getAlbumsByIds: async () => [],
				getArtist: async () => null,
				getTracksByAlbum: async () => [],
			};
		}

		afterEach(() => {
			appServices.clear();
		});

		valdiIt('reloads against the new transport when going online', async (driver) => {
			const component = driver.renderComponent(
				AlbumView,
				{
					album,
					downloadService,
					networkStatus,
					playbackStore,
					preferences,
					transport: offlineTransport(),
					viewCache: makeTestViewCache(),
				},
				{ navigator: mockNavigator },
			);
			await flushAsyncWork();
			expect(component.state.tracks.length).toBe(0);

			const tracks = [{ duration: 120, id: 'track-1', name: 'Song One', trackNumber: 1 }];
			setTestAppServices({
				transport: {
					getAlbumsByIds: async () => [],
					getArtist: async () => null,
					getTracksByAlbum: async () => tracks,
				} as unknown as AppServicesBag['transport'],
			});
			await flushAsyncWork();

			expect(component.state.tracks.length).toBe(1);
			expect(component.state.tracks[0].name).toBe('Song One');
		});

		valdiIt('keeps the artist logo when going offline empties the album', async (driver) => {
			const tracks = [{ duration: 120, id: 'track-1', name: 'Song One', trackNumber: 1 }];
			const component = driver.renderComponent(
				AlbumView,
				{
					album,
					downloadService,
					networkStatus,
					playbackStore,
					preferences,
					transport: {
						getAlbumsByIds: async () => [],
						getArtist: async () => ({ id: 'artist-1', logoUrl: 'https://logo.png', name: 'A' }),
						getTracksByAlbum: async () => tracks,
					},
					viewCache: makeTestViewCache(),
				},
				{ navigator: mockNavigator },
			);
			await flushAsyncWork();
			expect(component.state.artistLogoUrl).toBe('https://logo.png');

			// the real OfflineTransport resolves the logo from the image cache even when the album
			// itself is not downloaded, so the header keeps it while the track list empties
			setTestAppServices({
				transport: {
					...offlineTransport(),
					getArtist: async () => ({ id: 'artist-1', logoUrl: 'https://logo.png', name: 'A' }),
				} as unknown as AppServicesBag['transport'],
			});
			await flushAsyncWork();

			expect(component.state.tracks.length).toBe(0);
			expect(component.state.artistLogoUrl).toBe('https://logo.png');
		});

		valdiIt('does not reload when the transport is unchanged', async (driver) => {
			let getTracksByAlbumCalls = 0;
			const transport = {
				getAlbumsByIds: async () => [],
				getArtist: async () => null,
				getTracksByAlbum: async () => {
					getTracksByAlbumCalls += 1;
					return [];
				},
			};

			driver.renderComponent(
				AlbumView,
				{
					album,
					downloadService,
					networkStatus,
					playbackStore,
					preferences,
					transport,
					viewCache: makeTestViewCache(),
				},
				{ navigator: mockNavigator },
			);
			await flushAsyncWork();
			expect(getTracksByAlbumCalls).toBe(1);

			// a download-progress notification carries the same transport, so it must not re-fetch
			setTestAppServices({ transport: transport as unknown as AppServicesBag['transport'] });
			await flushAsyncWork();

			expect(getTracksByAlbumCalls).toBe(1);
		});
	});

	describe('header artwork context menu', () => {
		const album = {
			artistId: 'artist-1',
			artistName: 'Artist One',
			id: 'album-1',
			name: 'First Album',
		};

		function makeTransport() {
			return {
				getAlbumsByIds: async () => [],
				getArtist: async () => null,
				getArtistLogoUrl: async () => null,
				getPlaylists: async () => ({ hasMore: false, items: [] }),
				getTracksByAlbum: async () => [],
				peekArtistLogoUrl: () => undefined,
			};
		}

		function makePlaybackStore() {
			return { play: () => {}, setArtistLogoUrl: () => {}, subscribe: () => () => {}, track: null };
		}

		async function renderWithSlot(
			driver: Parameters<Parameters<typeof valdiIt>[1]>[0],
			overrides: Record<string, unknown> = {},
		) {
			const menuPreferences = new Preferences({
				fetchString: async () => '',
				storeString: async () => {},
			});
			await menuPreferences.setAnimationsEnabled(false);
			return driver.renderComponent(
				AlbumViewWithSlot,
				{
					album,
					downloadService,
					networkStatus,
					playbackStore: makePlaybackStore(),
					preferences: menuPreferences,
					toastService: { show: () => {} },
					transport: makeTransport(),
					viewCache: makeTestViewCache(),
					...overrides,
				} as unknown as AlbumViewModel,
				{ navigator: mockNavigator },
			);
		}

		valdiIt('opens the card context menu on artwork long press', async (driver) => {
			const component = await renderWithSlot(driver);
			await waitForLabel(component, 'detail-header-artwork');
			// the view is a NavigationPage nested inside the wrapper; prove it mounted before
			// reading anything into the absence of the menu
			expect(findByLabel(component, 'detail-header-artwork')).not.toBeUndefined();

			longPressArtwork(component);
			await waitForLabel(component, 'card-context-menu');

			expect(findByLabel(component, 'card-context-menu')).not.toBeUndefined();
			expect(findByLabel(component, 'card-context-menu-album')).not.toBeUndefined();
		});

		valdiIt('offers the actions the header buttons do not', async (driver) => {
			const component = await renderWithSlot(driver);
			await waitForLabel(component, 'detail-header-artwork');

			longPressArtwork(component);
			await waitForLabel(component, 'card-context-menu');

			for (const action of [
				'card-context-play-next',
				'card-context-instant-mix',
				'card-context-add-to-playlist',
				'card-context-create-playlist',
				'card-context-pin',
			]) {
				expect(findByLabel(component, action)).not.toBeUndefined();
			}
		});

		// the view self-heals a missing imageUrl into state.fullAlbum; the menu must pin that,
		// not the partial album the caller pushed with
		valdiIt('pins the hydrated album, not the partial one', async (driver) => {
			const partialAlbum = { ...album, genres: [] };
			const hydratedAlbum = { ...partialAlbum, imageUrl: 'https://art.png' };
			const pinned: Array<unknown> = [];
			const pinnedItemsStore = {
				isPinned: () => false,
				pin: (item: unknown) => {
					pinned.push(item);
					return Promise.resolve();
				},
				subscribe: () => () => {},
				unpin: () => Promise.resolve(),
			};
			const component = await renderWithSlot(driver, {
				album: partialAlbum,
				pinnedItemsStore,
				transport: { ...makeTransport(), getAlbumsByIds: async () => [hydratedAlbum] },
			});
			await waitForLabel(component, 'detail-header-artwork');

			longPressArtwork(component);
			await waitForLabel(component, 'card-context-pin');
			findByLabel(component, 'card-context-pin')?.getAttribute('onTap')?.(touchEvent);

			expect(pinned).toEqual([{ album: hydratedAlbum, kind: 'album' }]);
		});
	});
});
