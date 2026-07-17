import 'jasmine/src/jasmine';
import { Preferences } from 'atolla/src/stores/Preferences';
import { GenreView } from 'atolla/src/ui/views/GenreView';
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
	getGenreDownloadState: () => 'not_downloaded',
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

const emptyTracksPage = async () => ({ hasMore: false, items: [], totalCount: 0 });

describe('GenreView', () => {
	valdiIt('self-heals the header image when the genre has no imageUrl', async (driver) => {
		const genre = { id: 'genre-1', name: 'Rock' };
		let getGenreCalls = 0;
		const transport = {
			getGenre: async () => {
				getGenreCalls += 1;
				return { id: 'genre-1', imageUrl: 'https://g.png', name: 'Rock' };
			},
			getTracksByGenre: emptyTracksPage,
		};

		const component = driver.renderComponent(
			GenreView,
			{
				downloadService,
				genre,
				onRootDetailControllerReady: () => {},
				playbackStore,
				preferences,
				transport,
				viewCache: makeTestViewCache(),
			},
			{ navigator: mockNavigator },
		);
		component.setState({ isLoading: false });

		await flushAsyncWork();

		expect(getGenreCalls).toBe(1);
		expect(component.state.hydratedGenre?.imageUrl).toBe('https://g.png');
	});

	valdiIt('does not fetch the genre when it already has an image', async (driver) => {
		const genre = { id: 'genre-1', imageUrl: 'https://existing.png', name: 'Rock' };
		let getGenreCalls = 0;
		const transport = {
			getGenre: async () => {
				getGenreCalls += 1;
				return null;
			},
			getTracksByGenre: emptyTracksPage,
		};

		const component = driver.renderComponent(
			GenreView,
			{
				downloadService,
				genre,
				onRootDetailControllerReady: () => {},
				playbackStore,
				preferences,
				transport,
				viewCache: makeTestViewCache(),
			},
			{ navigator: mockNavigator },
		);
		component.setState({ isLoading: false });

		await flushAsyncWork();

		expect(getGenreCalls).toBe(0);
		expect(component.state.hydratedGenre).toBeNull();
	});
});
