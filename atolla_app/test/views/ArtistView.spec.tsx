import 'jasmine/src/jasmine';
import { type AppServicesBag, appServices } from 'atolla_app/src/services/AppServices';
import { Preferences } from 'atolla_app/src/stores/Preferences';
import { ArtistView } from 'atolla_app/src/ui/views/ArtistView';
import { setTestAppServices } from 'atolla_app/test/util/appServices';
import { makeTestViewCache } from 'atolla_app/test/util/viewCache';
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
});
