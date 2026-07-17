import 'jasmine/src/jasmine';
import { Preferences } from 'atolla/src/stores/Preferences';
import { ArtistView } from 'atolla/src/ui/views/ArtistView';
import { makeTestViewCache } from 'atolla/test/util/viewCache';
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
});
