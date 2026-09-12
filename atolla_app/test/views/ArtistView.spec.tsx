import 'jasmine/src/jasmine';
import { type AppServicesBag, appServices } from 'atolla_app/src/services/AppServices';
import { Preferences } from 'atolla_app/src/stores/Preferences';
import { ArtistView, type ArtistViewModel } from 'atolla_app/src/ui/views/ArtistView';
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

class ArtistViewWithSlot extends Component<ArtistViewModel> {
	private slot = new DetachedSlot();

	onRender() {
		<view>
			<ArtistView {...this.viewModel} modalSlot={this.slot} />
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

function longPress(component: unknown, label: string): void {
	jasmine.clock().install();
	try {
		findByLabel(component, label)?.getAttribute('onTouch')?.(touchEventWith({ state: 0 }));
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
	getArtistDownloadState: () => 'not_downloaded',
	subscribe: () => () => {},
};

const playbackStore = {
	subscribe: () => () => {},
	track: null,
};

const networkStatus = { getTransport: () => 'wifi', subscribe: () => () => {} };

const preferences = new Preferences({ fetchString: async () => '', storeString: async () => {} });

async function flushAsyncWork() {
	for (let i = 0; i < 10; i += 1) {
		await Promise.resolve();
	}
}

function baseTransport() {
	return {
		getAlbumsByArtist: async () => [],
		getArtistTopTracks: async () => [],
		getTracksByArtist: async () => [],
	};
}

describe('ArtistView', () => {
	valdiIt('self-heals the header image and logo when the artist has neither', async (driver) => {
		const artist = { id: 'artist-1', name: 'Artist One' };
		let getArtistCalls = 0;
		const transport = {
			...baseTransport(),
			getArtist: async () => {
				getArtistCalls += 1;
				return {
					id: 'artist-1',
					imageUrl: 'https://a.png',
					logoUrl: 'https://l.png',
					name: 'Artist One',
				};
			},
		};

		const component = driver.renderComponent(
			ArtistView,
			{
				artist,
				downloadService,
				networkStatus,
				playbackStore,
				preferences,
				transport,
				viewCache: makeTestViewCache(),
			},
			{ navigator: mockNavigator },
		);
		component.setState({ albumsLoaded: true, topTracksLoaded: true });

		await flushAsyncWork();

		expect(getArtistCalls).toBe(1);
		expect(component.state.hydratedArtist?.imageUrl).toBe('https://a.png');
		expect(component.state.hydratedArtist?.logoUrl).toBe('https://l.png');
	});

	valdiIt('does not re-fetch the artist when it already has an image and logo', async (driver) => {
		const artist = {
			id: 'artist-1',
			imageUrl: 'https://a.png',
			logoUrl: 'https://l.png',
			name: 'Artist One',
		};
		let getArtistCalls = 0;
		const transport = {
			...baseTransport(),
			getArtist: async () => {
				getArtistCalls += 1;
				return null;
			},
		};

		const component = driver.renderComponent(
			ArtistView,
			{
				artist,
				downloadService,
				networkStatus,
				playbackStore,
				preferences,
				transport,
				viewCache: makeTestViewCache(),
			},
			{ navigator: mockNavigator },
		);
		component.setState({ albumsLoaded: true, topTracksLoaded: true });

		await flushAsyncWork();

		expect(getArtistCalls).toBe(0);
		expect(component.state.hydratedArtist).toBeNull();
	});

	describe('connection mode changes', () => {
		const artist = {
			id: 'artist-1',
			imageUrl: 'https://a.png',
			logoUrl: 'https://l.png',
			name: 'Artist One',
		};

		afterEach(() => {
			appServices.clear();
		});

		valdiIt('reloads against the new transport when going online', async (driver) => {
			const component = driver.renderComponent(
				ArtistView,
				{
					artist,
					downloadService,
					networkStatus,
					playbackStore,
					preferences,
					transport: { ...baseTransport(), getArtist: async () => null },
					viewCache: makeTestViewCache(),
				},
				{ navigator: mockNavigator },
			);
			await flushAsyncWork();
			expect(component.state.topTracks.length).toBe(0);

			const topTracks = [{ duration: 120, id: 'track-1', name: 'Song One', trackNumber: 1 }];
			setTestAppServices({
				transport: {
					...baseTransport(),
					getArtist: async () => null,
					getArtistTopTracks: async () => topTracks,
				} as unknown as AppServicesBag['transport'],
			});
			await flushAsyncWork();

			expect(component.state.topTracks.length).toBe(1);
			expect(component.state.topTracks[0].name).toBe('Song One');
		});

		valdiIt('does not reload when the transport is unchanged', async (driver) => {
			let getArtistTopTracksCalls = 0;
			const transport = {
				...baseTransport(),
				getArtist: async () => null,
				getArtistTopTracks: async () => {
					getArtistTopTracksCalls += 1;
					return [];
				},
			};

			driver.renderComponent(
				ArtistView,
				{
					artist,
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
			expect(getArtistTopTracksCalls).toBe(1);

			// a download-progress notification carries the same transport, so it must not re-fetch
			setTestAppServices({ transport: transport as unknown as AppServicesBag['transport'] });
			await flushAsyncWork();

			expect(getArtistTopTracksCalls).toBe(1);
		});
	});

	describe('header artwork context menu', () => {
		const artist = { id: 'artist-1', name: 'Artist One' };
		const album = {
			artistId: 'artist-1',
			artistName: 'Artist One',
			id: 'album-1',
			name: 'First Album',
		};

		async function renderWithSlot(overrides: Record<string, unknown>, driver: unknown) {
			const menuPreferences = new Preferences({
				fetchString: async () => '',
				storeString: async () => {},
			});
			await menuPreferences.setAnimationsEnabled(false);
			return (
				driver as { renderComponent: (c: unknown, vm: unknown, ctx: unknown) => unknown }
			).renderComponent(
				ArtistViewWithSlot,
				{
					artist,
					downloadService,
					networkStatus,
					playbackStore,
					preferences: menuPreferences,
					toastService: { show: () => {} },
					transport: {
						...baseTransport(),
						getAlbumsByArtist: async () => [album],
						getArtist: async () => null,
						getArtistLogoUrl: async () => null,
						getPlaylists: async () => ({ hasMore: false, items: [] }),
						getTracksByAlbum: async () => [],
						peekArtistLogoUrl: () => undefined,
					},
					viewCache: makeTestViewCache(),
					...overrides,
				},
				{ navigator: mockNavigator },
			);
		}

		valdiIt('opens an artist context menu, not an album one', async (driver) => {
			const component = await renderWithSlot({}, driver);
			await waitForLabel(component, 'detail-header-artwork');
			expect(findByLabel(component, 'detail-header-artwork')).not.toBeUndefined();

			longPress(component, 'detail-header-artwork');
			await waitForLabel(component, 'card-context-menu');

			expect(findByLabel(component, 'card-context-menu')).not.toBeUndefined();
			// the album entity row only renders for an album card, so its absence proves the
			// header opened the artist's own menu rather than the album grid's
			expect(findByLabel(component, 'card-context-menu-album')).toBeUndefined();
		});

		valdiIt('pins the artist from the header menu', async (driver) => {
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
			const component = await renderWithSlot({ pinnedItemsStore }, driver);
			await waitForLabel(component, 'detail-header-artwork');

			longPress(component, 'detail-header-artwork');
			await waitForLabel(component, 'card-context-pin');
			findByLabel(component, 'card-context-pin')?.getAttribute('onTap')?.(touchEvent);

			expect(pinned).toEqual([{ artist, kind: 'artist' }]);
		});

		// the album grid's menu keeps its own bookkeeping; the header path must not touch it
		valdiIt('leaves the album grid menu state untouched', async (driver) => {
			const component = await renderWithSlot({}, driver);
			await waitForLabel(component, 'card-album-1');
			expect(findByLabel(component, 'card-album-1')).not.toBeUndefined();

			longPress(component, 'card-album-1');
			await waitForLabel(component, 'card-context-menu');
			// the album grid's menu really opened, so its bookkeeping is populated
			expect(findByLabel(component, 'card-context-menu-album')).not.toBeUndefined();
			findByLabel(component, 'card-context-backdrop')?.getAttribute('onTap')?.(touchEvent);
			await waitForLabel(component, 'nothing-matches-this');

			longPress(component, 'detail-header-artwork');
			await waitForLabel(component, 'card-context-menu');

			// a stale album card would resurface the album entity row here
			expect(findByLabel(component, 'card-context-menu')).not.toBeUndefined();
			expect(findByLabel(component, 'card-context-menu-album')).toBeUndefined();
		});
	});
});
