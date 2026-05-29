import 'jasmine/src/jasmine';
import { AddToPlaylistView } from 'atolla/src/ui/views/AddToPlaylistView';
import { createComponent, valdiIt } from 'valdi_test/test/JSXTestUtils';

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
	valdiIt('loads the first playlist page on create via getPlaylistsPage', async () => {
		const requestedPages: Array<number> = [];
		const allPlaylists = makePlaylists(60);
		const transport = {
			getPlaylistsPage: (page: number, size: number) => {
				requestedPages.push(page);
				const start = (page - 1) * size;
				return Promise.resolve({
					hasMore: start + size < allPlaylists.length,
					items: allPlaylists.slice(start, start + size),
				});
			},
		};

		const instrumented = createComponent(AddToPlaylistView, {
			animationsEnabled: false,
			gridColumns: 2,
			imageCache: stubImageCache,
			onDismiss: () => {},
			tracks: [{ duration: 120, id: 'track-1', name: 'Track One' }],
			transport,
		});
		const component = instrumented.getComponent();

		await flushAsyncWork();
		await flushAsyncWork();

		expect(requestedPages).toEqual([1]);
		expect(component.state.playlists.length).toBe(pageSize);
		expect(component.state.hasMore).toBeTrue();
	});

	valdiIt('appends the next page when loadMore runs', async () => {
		const allPlaylists = makePlaylists(40);
		const transport = {
			getPlaylistsPage: (page: number, size: number) => {
				const start = (page - 1) * size;
				return Promise.resolve({
					hasMore: start + size < allPlaylists.length,
					items: allPlaylists.slice(start, start + size),
				});
			},
		};

		const instrumented = createComponent(AddToPlaylistView, {
			animationsEnabled: false,
			gridColumns: 2,
			imageCache: stubImageCache,
			onDismiss: () => {},
			tracks: [],
			transport,
		});
		const component = instrumented.getComponent();

		await flushAsyncWork();
		await flushAsyncWork();
		expect(component.state.playlists.length).toBe(pageSize);

		component.loadMore();
		await flushAsyncWork();

		expect(component.state.playlists.length).toBe(40);
		expect(component.state.hasMore).toBeFalse();
	});
});
