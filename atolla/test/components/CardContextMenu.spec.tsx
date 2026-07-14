import 'jasmine/src/jasmine';
import type { Album } from 'atolla/src/models/Album';
import type { Genre } from 'atolla/src/models/Genre';
import type { Playlist } from 'atolla/src/models/Playlist';
import type { Track } from 'atolla/src/models/Track';
import type { PlaybackStore } from 'atolla/src/stores/Playback';
import type { Transport } from 'atolla/src/transports/Transport';
import { CardContextMenu } from 'atolla/src/ui/components/CardContextMenu';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';

function mockTrack(id = 'track-1'): Track {
	return { duration: 180, id, name: `Track ${id}` } as Track;
}

function mockAlbum(): Album {
	return {
		artistId: 'artist-1',
		artistName: 'Artist One',
		id: 'album-1',
		name: 'Album One',
	} as Album;
}

function mockGenre(): Genre {
	return { id: 'genre-1', name: 'Rock' } as Genre;
}

function mockPlaylist(): Playlist {
	return { id: 'playlist-1', name: 'Roadtrip' } as Playlist;
}

function mockTransport(overrides: Record<string, unknown> = {}): Transport {
	return {
		getArtistLogoUrl: () => Promise.resolve(null),
		getTracksByAlbum: () => Promise.resolve([mockTrack()]),
		getTracksByArtist: () => Promise.resolve([mockTrack()]),
		getTracksByGenre: () => Promise.resolve([mockTrack()]),
		getTracksByGenrePage: () =>
			Promise.resolve({ hasMore: false, items: [mockTrack()], totalCount: 1 }),
		getTracksByPlaylistPage: () => Promise.resolve({ hasMore: false, items: [mockTrack()] }),
		...overrides,
	} as unknown as Transport;
}

// drains the microtask queue so the fire-and-forget fetch chain settles
async function flush(): Promise<void> {
	for (let i = 0; i < 5; i++) {
		await Promise.resolve();
	}
}

type MenuInternal = Record<string, unknown>;

function getInternal(component: CardContextMenu): MenuInternal {
	return component as unknown as MenuInternal;
}

describe('CardContextMenu', () => {
	describe('handlePlay()', () => {
		valdiIt('plays the fetched tracks and dismisses with the toast', async (driver) => {
			const play = jasmine.createSpy('play');
			const onDismiss = jasmine.createSpy('onDismiss');
			const viewModel = {
				animationsEnabled: false,
				card: { album: mockAlbum(), kind: 'album' },
				onDismiss,
				playbackStore: {
					play,
					playTracks: jasmine.createSpy('playTracks'),
				} as unknown as PlaybackStore,
				transport: mockTransport(),
			};
			const component = driver.renderComponent(CardContextMenu, viewModel, undefined);

			(getInternal(component).handlePlay as () => void)();
			await flush();

			expect(play).toHaveBeenCalled();
			expect(onDismiss).toHaveBeenCalled();
		});

		valdiIt('swallows a rejected fetch: still dismisses and does not play', async (driver) => {
			const play = jasmine.createSpy('play');
			const onDismiss = jasmine.createSpy('onDismiss');
			const viewModel = {
				animationsEnabled: false,
				card: { album: mockAlbum(), kind: 'album' },
				onDismiss,
				playbackStore: {
					play,
					playTracks: jasmine.createSpy('playTracks'),
				} as unknown as PlaybackStore,
				transport: mockTransport({ getTracksByAlbum: () => Promise.reject(new Error('boom')) }),
			};
			const component = driver.renderComponent(CardContextMenu, viewModel, undefined);

			(getInternal(component).handlePlay as () => void)();
			await flush();

			// a failed fetch must not surface as an unhandled rejection; the menu was already
			// dismissed optimistically and nothing is played
			expect(play).not.toHaveBeenCalled();
			expect(onDismiss).toHaveBeenCalled();
		});

		valdiIt('does not play an empty fetch result', async (driver) => {
			const play = jasmine.createSpy('play');
			const viewModel = {
				animationsEnabled: false,
				card: { album: mockAlbum(), kind: 'album' },
				onDismiss: jasmine.createSpy('onDismiss'),
				playbackStore: {
					play,
					playTracks: jasmine.createSpy('playTracks'),
				} as unknown as PlaybackStore,
				transport: mockTransport({ getTracksByAlbum: () => Promise.resolve([]) }),
			};
			const component = driver.renderComponent(CardContextMenu, viewModel, undefined);

			(getInternal(component).handlePlay as () => void)();
			await flush();

			expect(play).not.toHaveBeenCalled();
		});
	});

	describe('handleAddToQueue()', () => {
		valdiIt('swallows a rejected fetch and still dismisses', async (driver) => {
			const addToQueue = jasmine.createSpy('addToQueue');
			const onDismiss = jasmine.createSpy('onDismiss');
			const viewModel = {
				animationsEnabled: false,
				card: { album: mockAlbum(), kind: 'album' },
				onDismiss,
				playbackStore: { addToQueue } as unknown as PlaybackStore,
				transport: mockTransport({ getTracksByAlbum: () => Promise.reject(new Error('boom')) }),
			};
			const component = driver.renderComponent(CardContextMenu, viewModel, undefined);

			(getInternal(component).handleAddToQueue as () => void)();
			await flush();

			expect(addToQueue).not.toHaveBeenCalled();
			expect(onDismiss).toHaveBeenCalled();
		});
	});

	describe('paged playback (genre and playlist)', () => {
		function mockPagedStore() {
			const addToQueue = jasmine.createSpy('addToQueue');
			const playNext = jasmine.createSpy('playNext');
			const playTracks = jasmine.createSpy('playTracks');
			const setQueueFiller = jasmine.createSpy('setQueueFiller');
			const store = {
				addToQueue,
				playNext,
				playTracks,
				setQueueFiller,
				subscribe: () => () => {},
				trackIndex: 0,
				tracks: [] as Array<Track>,
			} as unknown as PlaybackStore;
			return { addToQueue, playNext, playTracks, setQueueFiller, store };
		}

		valdiIt(
			'genre Play streams the first page and registers a loader when more remain',
			async (driver) => {
				const { playTracks, setQueueFiller, store } = mockPagedStore();
				const page = [mockTrack('g1')];
				const component = driver.renderComponent(
					CardContextMenu,
					{
						animationsEnabled: false,
						card: { genre: mockGenre(), kind: 'genre' },
						onDismiss: jasmine.createSpy('onDismiss'),
						playbackStore: store,
						transport: mockTransport({
							getTracksByGenrePage: () =>
								Promise.resolve({ hasMore: true, items: page, totalCount: 99 }),
						}),
					},
					undefined,
				);

				(getInternal(component).handlePlay as () => void)();
				await flush();

				expect(playTracks).toHaveBeenCalledWith(page, 0);
				expect(setQueueFiller.calls.mostRecent().args[0]).not.toBeNull();
			},
		);

		valdiIt(
			'playlist Play streams the first page and registers a loader for a large playlist',
			async (driver) => {
				const { playTracks, setQueueFiller, store } = mockPagedStore();
				const page = [mockTrack('p1'), mockTrack('p2')];
				const component = driver.renderComponent(
					CardContextMenu,
					{
						animationsEnabled: false,
						card: { kind: 'playlist', playlist: mockPlaylist() },
						onDismiss: jasmine.createSpy('onDismiss'),
						playbackStore: store,
						transport: mockTransport({
							getTracksByPlaylistPage: () =>
								Promise.resolve({ hasMore: true, items: page, totalCount: 600 }),
						}),
					},
					undefined,
				);

				(getInternal(component).handlePlay as () => void)();
				await flush();

				expect(playTracks).toHaveBeenCalledWith(page, 0);
				expect(setQueueFiller.calls.mostRecent().args[0]).not.toBeNull();
			},
		);

		valdiIt(
			'paged Play does not register a loader when the first page is the last',
			async (driver) => {
				const { playTracks, setQueueFiller, store } = mockPagedStore();
				const page = [mockTrack('p1')];
				const component = driver.renderComponent(
					CardContextMenu,
					{
						animationsEnabled: false,
						card: { kind: 'playlist', playlist: mockPlaylist() },
						onDismiss: jasmine.createSpy('onDismiss'),
						playbackStore: store,
						transport: mockTransport({
							getTracksByPlaylistPage: () =>
								Promise.resolve({ hasMore: false, items: page, totalCount: 1 }),
						}),
					},
					undefined,
				);

				(getInternal(component).handlePlay as () => void)();
				await flush();

				expect(playTracks).toHaveBeenCalledWith(page, 0);
				expect(setQueueFiller).not.toHaveBeenCalled();
			},
		);

		valdiIt(
			'genre Play Next queues a single bounded page after the current track',
			async (driver) => {
				const { playNext, store } = mockPagedStore();
				const page = [mockTrack('g1'), mockTrack('g2')];
				const getTracksByGenrePage = jasmine
					.createSpy('getTracksByGenrePage')
					.and.returnValue(Promise.resolve({ hasMore: true, items: page, totalCount: 99 }));
				const component = driver.renderComponent(
					CardContextMenu,
					{
						animationsEnabled: false,
						card: { genre: mockGenre(), kind: 'genre' },
						onDismiss: jasmine.createSpy('onDismiss'),
						playbackStore: store,
						transport: mockTransport({ getTracksByGenrePage }),
					},
					undefined,
				);

				(getInternal(component).handlePlayNext as () => void)();
				await flush();

				expect(getTracksByGenrePage).toHaveBeenCalledWith('genre-1', 1, jasmine.any(Number));
				expect(playNext).toHaveBeenCalledWith(page);
			},
		);

		valdiIt('playlist Add to Queue appends a single bounded page', async (driver) => {
			const { addToQueue, store } = mockPagedStore();
			const page = [mockTrack('p1')];
			const getTracksByPlaylistPage = jasmine
				.createSpy('getTracksByPlaylistPage')
				.and.returnValue(Promise.resolve({ hasMore: true, items: page, totalCount: 600 }));
			const component = driver.renderComponent(
				CardContextMenu,
				{
					animationsEnabled: false,
					card: { kind: 'playlist', playlist: mockPlaylist() },
					onDismiss: jasmine.createSpy('onDismiss'),
					playbackStore: store,
					transport: mockTransport({ getTracksByPlaylistPage }),
				},
				undefined,
			);

			(getInternal(component).handleAddToQueue as () => void)();
			await flush();

			expect(getTracksByPlaylistPage).toHaveBeenCalledWith('playlist-1', 1, jasmine.any(Number));
			expect(addToQueue).toHaveBeenCalledWith(page);
		});

		valdiIt('genre Add to Playlist still passes the full genre track list', async (driver) => {
			const onAddToPlaylist = jasmine.createSpy('onAddToPlaylist');
			const full = [mockTrack('g1'), mockTrack('g2')];
			const component = driver.renderComponent(
				CardContextMenu,
				{
					animationsEnabled: false,
					card: { genre: mockGenre(), kind: 'genre' },
					onAddToPlaylist,
					onDismiss: jasmine.createSpy('onDismiss'),
					playbackStore: {} as unknown as PlaybackStore,
					transport: mockTransport({ getTracksByGenre: () => Promise.resolve(full) }),
				},
				undefined,
			);

			(getInternal(component).handleAddToPlaylist as () => void)();
			await flush();

			expect(onAddToPlaylist).toHaveBeenCalledWith(full);
		});
	});
});
