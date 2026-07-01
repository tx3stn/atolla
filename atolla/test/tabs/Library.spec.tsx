import 'jasmine/src/jasmine';
import { HeaderTabs } from 'atolla/src/models/App';
import { PlaybackStore } from 'atolla/src/stores/Playback';
import { ConnectionModes } from 'atolla/src/transports/Model';
import { LibraryView } from 'atolla/src/ui/tabs/Library';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';

const stubImageCache = {
	get: () => null,
	getOrLoad: () => null,
	prefetch: () => Promise.resolve(),
	subscribe: () => () => {},
};

const stubTransport = {
	getAlbumsPage: async () => ({ hasMore: false, items: [] }),
	getArtistsPage: async () => ({ hasMore: false, items: [] }),
	getPlaylistsPage: async () => ({ hasMore: false, items: [] }),
};

const stubDownloadService = {
	getAlbumDownloadState: () => 'not_downloaded',
	subscribe: () => () => {},
};

async function flushAsyncWork() {
	await Promise.resolve();
	await Promise.resolve();
}

function makeViewModel() {
	return {
		animationsEnabled: false,
		connectionMode: ConnectionModes.online,
		downloadService: stubDownloadService,
		gridColumns: 3,
		imageCache: stubImageCache,
		onNavigationControllerReady: () => {},
		playbackStore: new PlaybackStore(),
		toastService: { show: () => {} },
		transport: stubTransport,
	};
}

describe('LibraryView', () => {
	valdiIt('defaults to the artists tab', async (driver) => {
		const viewModel = makeViewModel();
		const component = driver.renderComponent(LibraryView, viewModel, undefined);

		await flushAsyncWork();

		expect(component.state.activeTab).toBe(HeaderTabs.artists);
		expect(component.state.letterFilter).toBeNull();
	});
});
