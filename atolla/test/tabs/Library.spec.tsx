import 'jasmine/src/jasmine';
import { HeaderTabs } from 'atolla/src/models/App';
import type { LibraryNavHandle } from 'atolla/src/services/NavCoordinator';
import { HeaderStore } from 'atolla/src/stores/Header';
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
	let handle: LibraryNavHandle | null = null;
	const navCoordinator = {
		registerLibrary: (registered: LibraryNavHandle | null) => {
			handle = registered;
		},
	};
	const viewModel = {
		animationsEnabled: false,
		connectionMode: ConnectionModes.online,
		downloadService: stubDownloadService,
		gridColumns: 3,
		headerStore: new HeaderStore(),
		imageCache: stubImageCache,
		navCoordinator,
		onNavigationControllerReady: () => {},
		onRequestModeChange: async () => true,
		playbackStore: new PlaybackStore(),
		toastService: { show: () => {} },
		transport: stubTransport,
	};
	return { getHandle: () => handle, viewModel };
}

describe('LibraryView', () => {
	valdiIt('defaults to the artists tab', async (driver) => {
		const { viewModel } = makeViewModel();
		const component = driver.renderComponent(LibraryView, viewModel, undefined);

		await flushAsyncWork();

		expect(component.state.activeTab).toBe(HeaderTabs.artists);
		expect(component.state.letterFilter).toBeNull();
	});

	valdiIt(
		'registers a library navigation handle with the coordinator on create',
		async (driver) => {
			const { getHandle, viewModel } = makeViewModel();
			driver.renderComponent(LibraryView, viewModel, undefined);

			await flushAsyncWork();

			const handle = getHandle();
			expect(typeof handle?.showAlbum).toBe('function');
			expect(typeof handle?.showArtist).toBe('function');
			expect(typeof handle?.showPlaylist).toBe('function');
		},
	);
});
