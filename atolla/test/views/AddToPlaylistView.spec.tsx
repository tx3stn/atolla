import 'jasmine/src/jasmine';
import { ToastService } from 'atolla/src/services/ToastService';
import { AddToPlaylistView } from 'atolla/src/ui/views/AddToPlaylistView';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';

const pageSize = 24;

const stubImageCache = {
	get: () => null,
	getOrLoad: () => null,
	prefetch: () => Promise.resolve(),
	subscribe: () => () => {},
};

function makePlaylists(count: number, offset = 0) {
	return Array.from({ length: count }, (_, index) => ({
		id: `playlist-${offset + index}`,
		name: `Playlist ${String(offset + index).padStart(3, '0')}`,
	}));
}

async function flushAsyncWork() {
	await Promise.resolve();
	await Promise.resolve();
}

describe('AddToPlaylistView', () => {
	valdiIt('loads the first playlist page on create via getPlaylists', async (driver) => {
		const requestedPages: Array<number> = [];
		const allPlaylists = makePlaylists(60);
		const transport = {
			getPlaylists: (page: number, size: number) => {
				requestedPages.push(page);
				const start = (page - 1) * size;
				return Promise.resolve({
					hasMore: start + size < allPlaylists.length,
					items: allPlaylists.slice(start, start + size),
				});
			},
		};

		const viewModel = {
			animationsEnabled: false,
			gridColumns: 2,
			imageCache: stubImageCache,
			onDismiss: () => {},
			toastService: new ToastService(),
			tracks: [{ duration: 120, id: 'track-1', name: 'Track One' }],
			transport,
		};
		const component = driver.renderComponent(AddToPlaylistView, viewModel, undefined);

		await flushAsyncWork();
		await flushAsyncWork();

		expect(requestedPages).toEqual([1]);
		expect(component.state.playlists.length).toBe(pageSize);
		expect(component.state.hasMore).toBeTrue();
	});

	valdiIt('appends the next page when loadMore runs', async (driver) => {
		const allPlaylists = makePlaylists(40);
		const transport = {
			getPlaylists: (page: number, size: number) => {
				const start = (page - 1) * size;
				return Promise.resolve({
					hasMore: start + size < allPlaylists.length,
					items: allPlaylists.slice(start, start + size),
				});
			},
		};

		const viewModel = {
			animationsEnabled: false,
			gridColumns: 2,
			imageCache: stubImageCache,
			onDismiss: () => {},
			toastService: new ToastService(),
			tracks: [],
			transport,
		};
		const component = driver.renderComponent(AddToPlaylistView, viewModel, undefined);

		await flushAsyncWork();
		await flushAsyncWork();
		expect(component.state.playlists.length).toBe(pageSize);

		component.loadMore();
		await flushAsyncWork();

		expect(component.state.playlists.length).toBe(40);
		expect(component.state.hasMore).toBeFalse();
	});

	valdiIt('marks adding, toasts, and dismisses when a playlist is selected', async (driver) => {
		const added: Array<[string, string]> = [];
		let dismissed = false;
		const toastService = new ToastService();
		const transport = {
			addItemToPlaylist: (playlistId: string, trackId: string) => {
				added.push([playlistId, trackId]);
				return Promise.resolve();
			},
			getPlaylists: () => Promise.resolve({ hasMore: false, items: makePlaylists(2) }),
		};

		const viewModel = {
			animationsEnabled: false,
			gridColumns: 2,
			imageCache: stubImageCache,
			onDismiss: () => {
				dismissed = true;
			},
			toastService,
			tracks: [{ duration: 120, id: 'track-1', name: 'Track One' }],
			transport,
		};
		const component = driver.renderComponent(AddToPlaylistView, viewModel, undefined);
		await flushAsyncWork();

		component.handlePlaylistTap({ id: 'playlist-0', kind: 'playlist' });
		expect(component.state.isAddingToPlaylist).toBeTrue();

		await new Promise((resolve) => setTimeout(resolve, 0));
		await flushAsyncWork();

		expect(added).toEqual([['playlist-0', 'track-1']]);
		expect(toastService.getMessage()).not.toBeNull();
		expect(dismissed).toBeTrue();
	});

	valdiIt('reverts the adding state and surfaces an error when adding fails', async (driver) => {
		let dismissed = false;
		const transport = {
			addItemToPlaylist: () => Promise.reject(new Error('could not add')),
			getPlaylists: () => Promise.resolve({ hasMore: false, items: makePlaylists(2) }),
		};

		const viewModel = {
			animationsEnabled: false,
			gridColumns: 2,
			imageCache: stubImageCache,
			onDismiss: () => {
				dismissed = true;
			},
			toastService: new ToastService(),
			tracks: [{ duration: 120, id: 'track-1', name: 'Track One' }],
			transport,
		};
		const component = driver.renderComponent(AddToPlaylistView, viewModel, undefined);
		await flushAsyncWork();

		component.handlePlaylistTap({ id: 'playlist-0', kind: 'playlist' });
		await new Promise((resolve) => setTimeout(resolve, 0));
		await flushAsyncWork();

		expect(component.state.isAddingToPlaylist).toBeFalse();
		expect(component.state.errorMessage).toBe('could not add');
		expect(dismissed).toBeFalse();
	});
});
