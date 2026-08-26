import 'jasmine/src/jasmine';
import type { EntityRef } from 'atolla_app/src/services/EntityTracks';
import { HomeContextMenu } from 'atolla_app/src/ui/modals/HomeContextMenu';
import type { Album } from 'atolla_core/src/models/Album';
import type { Genre } from 'atolla_core/src/models/Genre';
import type { Track } from 'atolla_core/src/models/Track';
import type { Transport } from 'atolla_core/src/transports/Transport';
import type { TrackSource } from 'atolla_player/src/services/TrackSource';
import type { PlaybackStore } from 'atolla_player/src/stores/Playback';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';

function mockTrack(id: string): Track {
	return { duration: 180, id, name: `Track ${id}` } as Track;
}

function mockAlbum(id: string): Album {
	return {
		artistId: `artist-${id}`,
		artistName: 'Artist One',
		id,
		name: `Album ${id}`,
	} as Album;
}

function mockGenre(): Genre {
	return { id: 'genre-1', name: 'Rock' } as Genre;
}

function mockTransport(overrides: Record<string, unknown> = {}): Transport {
	return {
		getTracksByAlbum: (albumId: string) => Promise.resolve([mockTrack(`${albumId}-track`)]),
		getTracksByArtist: (artistId: string) => Promise.resolve([mockTrack(`${artistId}-track`)]),
		getTracksByGenre: (genreId: string, page: number) =>
			Promise.resolve({
				hasMore: page < 2,
				items: [mockTrack(`${genreId}-track-${page}`)],
				totalCount: 2,
			}),
		getTracksByPlaylist: (playlistId: string, page: number) =>
			Promise.resolve({ hasMore: false, items: [mockTrack(`${playlistId}-track-${page}`)] }),
		...overrides,
	} as unknown as Transport;
}

function mockPagedStore() {
	const addToQueue = jasmine.createSpy('addToQueue');
	const playNext = jasmine.createSpy('playNext');
	const playTracks = jasmine.createSpy('playTracks');
	const setQueueFiller = jasmine.createSpy('setQueueFiller');
	return {
		addToQueue,
		playNext,
		playTracks,
		setQueueFiller,
		store: {
			addToQueue,
			playNext,
			playTracks,
			setQueueFiller,
			subscribe: () => () => {},
			trackIndex: 0,
			tracks: [] as Array<Track>,
		} as unknown as PlaybackStore,
	};
}

const twoAlbums: Array<EntityRef> = [
	{ album: mockAlbum('album-1'), kind: 'album' },
	{ album: mockAlbum('album-2'), kind: 'album' },
];

function buildViewModel(overrides: Record<string, unknown> = {}) {
	return {
		animationsEnabled: false,
		items: twoAlbums,
		onAddToPlaylist: jasmine.createSpy('onAddToPlaylist'),
		onCreatePlaylist: jasmine.createSpy('onCreatePlaylist'),
		onDismiss: jasmine.createSpy('onDismiss'),
		playbackStore: mockPagedStore().store,
		title: 'RECENTLY ADDED',
		toastService: { show: jasmine.createSpy('show') },
		transport: mockTransport(),
		...overrides,
	};
}

async function flush(): Promise<void> {
	for (let i = 0; i < 10; i++) {
		await Promise.resolve();
	}
}

type MenuInternal = Record<string, unknown>;

function getInternal(component: HomeContextMenu): MenuInternal {
	return component as unknown as MenuInternal;
}

function trackIds(spy: jasmine.Spy): Array<string> {
	return (spy.calls.mostRecent().args[0] as Array<Track>).map((track) => track.id);
}

describe('HomeContextMenu', () => {
	describe('handlePlay()', () => {
		valdiIt('plays the first item straight away and dismisses', async (driver) => {
			const playback = mockPagedStore();
			const viewModel = buildViewModel({ playbackStore: playback.store });
			const component = driver.renderComponent(HomeContextMenu, viewModel, undefined);

			(getInternal(component).handlePlay as () => void)();
			await flush();

			expect(trackIds(playback.playTracks)).toEqual(['album-1-track']);
			expect(viewModel.onDismiss).toHaveBeenCalled();
		});

		valdiIt('backfills the remaining items as the queue drains', async (driver) => {
			const playback = mockPagedStore();
			const component = driver.renderComponent(
				HomeContextMenu,
				buildViewModel({ playbackStore: playback.store }),
				undefined,
			);

			(getInternal(component).handlePlay as () => void)();
			await flush();

			expect(playback.setQueueFiller).toHaveBeenCalled();
			expect(playback.setQueueFiller.calls.mostRecent().args[0]).not.toBeNull();
		});
	});

	describe('handlePlayNext()', () => {
		valdiIt('queues every item in the section and toasts', async (driver) => {
			const playback = mockPagedStore();
			const viewModel = buildViewModel({ playbackStore: playback.store });
			const component = driver.renderComponent(HomeContextMenu, viewModel, undefined);

			(getInternal(component).handlePlayNext as () => void)();
			await flush();

			expect(trackIds(playback.playNext)).toEqual(['album-1-track', 'album-2-track']);
			expect(viewModel.toastService.show).toHaveBeenCalledWith({
				message: 'playing next',
				variant: 'success',
			});
			expect(viewModel.onDismiss).toHaveBeenCalled();
		});
	});

	describe('handleAddToQueue()', () => {
		valdiIt('adds every item in the section and toasts', async (driver) => {
			const playback = mockPagedStore();
			const viewModel = buildViewModel({ playbackStore: playback.store });
			const component = driver.renderComponent(HomeContextMenu, viewModel, undefined);

			(getInternal(component).handleAddToQueue as () => void)();
			await flush();

			expect(trackIds(playback.addToQueue)).toEqual(['album-1-track', 'album-2-track']);
			expect(viewModel.toastService.show).toHaveBeenCalledWith({
				message: 'added to queue',
				variant: 'success',
			});
		});

		valdiIt('skips an item whose tracks fail to load', async (driver) => {
			const playback = mockPagedStore();
			const transport = mockTransport({
				getTracksByAlbum: (albumId: string) =>
					albumId === 'album-1'
						? Promise.reject(new Error('boom'))
						: Promise.resolve([mockTrack(`${albumId}-track`)]),
			});
			const component = driver.renderComponent(
				HomeContextMenu,
				buildViewModel({ playbackStore: playback.store, transport }),
				undefined,
			);

			(getInternal(component).handleAddToQueue as () => void)();
			await flush();

			expect(trackIds(playback.addToQueue)).toEqual(['album-2-track']);
		});
	});

	describe('handleShuffle()', () => {
		valdiIt('pools every item in the section', async (driver) => {
			const playback = mockPagedStore();
			const component = driver.renderComponent(
				HomeContextMenu,
				buildViewModel({ playbackStore: playback.store }),
				undefined,
			);

			(getInternal(component).handleShuffle as () => void)();
			await flush();

			expect(trackIds(playback.playTracks).sort()).toEqual(['album-1-track', 'album-2-track']);
		});

		valdiIt('asks paged items for a random ordering', async (driver) => {
			const getTracksByGenre = jasmine
				.createSpy('getTracksByGenre')
				.and.returnValue(Promise.resolve({ hasMore: false, items: [mockTrack('g1')] }));
			const playback = mockPagedStore();
			const component = driver.renderComponent(
				HomeContextMenu,
				buildViewModel({
					items: [{ genre: mockGenre(), kind: 'genre' }],
					playbackStore: playback.store,
					transport: mockTransport({ getTracksByGenre }),
				}),
				undefined,
			);

			(getInternal(component).handleShuffle as () => void)();
			await flush();

			expect(getTracksByGenre.calls.mostRecent().args[3]).toEqual({ sort: 'random' });
		});
	});

	describe('playlist actions', () => {
		valdiIt('hands add-to-playlist a source covering the whole section', async (driver) => {
			const viewModel = buildViewModel();
			const component = driver.renderComponent(HomeContextMenu, viewModel, undefined);

			(getInternal(component).handleAddToPlaylist as () => void)();
			const source = viewModel.onAddToPlaylist.calls.mostRecent().args[0] as TrackSource;

			expect((await source(1, 50)).items.map((track) => track.id)).toEqual(['album-1-track']);
			expect((await source(2, 50)).items.map((track) => track.id)).toEqual(['album-2-track']);
			expect((await source(3, 50)).hasMore).toBe(false);
			expect(viewModel.onDismiss).toHaveBeenCalled();
		});

		valdiIt('drains a paged item before moving to the next', async (driver) => {
			const viewModel = buildViewModel({
				items: [
					{ genre: mockGenre(), kind: 'genre' },
					{ album: mockAlbum('album-9'), kind: 'album' },
				],
			});
			const component = driver.renderComponent(HomeContextMenu, viewModel, undefined);

			(getInternal(component).handleCreatePlaylist as () => void)();
			const source = viewModel.onCreatePlaylist.calls.mostRecent().args[0] as TrackSource;

			expect((await source(1, 50)).items.map((track) => track.id)).toEqual(['genre-1-track-1']);
			expect((await source(2, 50)).items.map((track) => track.id)).toEqual(['genre-1-track-2']);
			expect((await source(3, 50)).items.map((track) => track.id)).toEqual(['album-9-track']);
		});
	});

	describe('onRender()', () => {
		valdiIt('offers no instant mix or pin', async (driver) => {
			const component = driver.renderComponent(HomeContextMenu, buildViewModel(), undefined);
			await flush();

			const labels = elementTypeFind(
				component.renderer.getComponentRootElements(component, true),
				IRenderedElementViewClass.View,
			)
				.map((element) => element.getAttribute('accessibilityLabel'))
				.filter((label): label is string => typeof label === 'string');

			expect(labels).toContain('home-context-play');
			expect(labels).toContain('home-context-create-playlist');
			expect(labels).not.toContain('home-context-instant-mix');
			expect(labels).not.toContain('home-context-pin');
		});
	});
});
