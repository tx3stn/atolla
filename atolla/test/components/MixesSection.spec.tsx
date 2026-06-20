import 'jasmine/src/jasmine';
import type { Track } from 'atolla/src/models/Track';
import type { PlaybackStore } from 'atolla/src/stores/Playback';
import { ConnectionModes } from 'atolla/src/transports/Model';
import type { Transport } from 'atolla/src/transports/Transport';
import { MixesSection } from 'atolla/src/ui/components/MixesSection';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';
import { touchEvent } from '../util/testEvents';

// Accessibility ids are the stable contract shared with the e2e tests, so pin them here.
const SHUFFLE_LIBRARY_TILE = 'card-mix-shuffle-library';
const RANDOM_ALBUM_TILE = 'card-mix-random-album';
const RANDOM_YEAR_TILE = 'card-mix-random-year';

function mockTrack(id = 'track-1'): Track {
	return { duration: 180, id, name: `Track ${id}` } as Track;
}

function mockTransport(overrides: Record<string, unknown> = {}): Transport {
	return {
		getRandomAlbum: () => Promise.resolve({ id: 'album-1', name: 'Album One' }),
		getRandomMusicYears: () => Promise.resolve([1990]),
		getShuffledLibraryTracks: () => Promise.resolve([mockTrack()]),
		getShuffledLibraryTracksPage: () => Promise.resolve({ hasMore: false, items: [mockTrack()] }),
		getTracksByAlbum: () => Promise.resolve([mockTrack()]),
		getTracksByYearPage: () => Promise.resolve({ hasMore: false, items: [mockTrack()] }),
		...overrides,
	} as unknown as Transport;
}

interface MockPlaybackStore {
	playTracks: jasmine.Spy;
	store: PlaybackStore;
	unsubscribe: jasmine.Spy;
}

function mockPlaybackStore(): MockPlaybackStore {
	const playTracks = jasmine.createSpy('playTracks');
	const unsubscribe = jasmine.createSpy('unsubscribe');
	const store = {
		addToQueue: jasmine.createSpy('addToQueue'),
		play: jasmine.createSpy('play'),
		playTracks,
		subscribe: () => unsubscribe,
		trackIndex: 0,
		tracks: [] as Array<Track>,
	} as unknown as PlaybackStore;
	return { playTracks, store, unsubscribe };
}

// Drains the microtask queue so the fire-and-forget mix chains settle.
async function flush(): Promise<void> {
	for (let i = 0; i < 10; i++) {
		await Promise.resolve();
	}
}

type SectionInternal = Record<string, unknown>;

function getInternal(component: MixesSection): SectionInternal {
	return component as unknown as SectionInternal;
}

function tapTile(component: MixesSection, accessibilityLabel: string): void {
	const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
	const tile = views.find((view) => view.getAttribute('accessibilityLabel') === accessibilityLabel);
	tile?.getAttribute('onTap')?.(touchEvent);
}

describe('MixesSection', () => {
	valdiIt('renders a tappable tile for each of the three mixes', async (driver) => {
		const viewModel = {
			connectionMode: ConnectionModes.online,
			gridColumns: 3,
			playbackStore: mockPlaybackStore().store,
			transport: mockTransport(),
		};
		const component = driver.renderComponent(MixesSection, viewModel, undefined);

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const tiles = views.filter((view) =>
			view.getAttribute('accessibilityLabel')?.startsWith('card-mix-'),
		);

		expect(tiles.length).toBe(3);
		const labels = tiles.map((tile) => tile.getAttribute('accessibilityLabel'));
		expect(labels).toContain(SHUFFLE_LIBRARY_TILE);
		expect(labels).toContain(RANDOM_ALBUM_TILE);
		expect(labels).toContain(RANDOM_YEAR_TILE);
	});

	describe('shuffle library mix', () => {
		valdiIt('plays a page from the paginated endpoint when online', async (driver) => {
			const playback = mockPlaybackStore();
			const page = mockTrack('online-1');
			const viewModel = {
				connectionMode: ConnectionModes.online,
				gridColumns: 3,
				playbackStore: playback.store,
				transport: mockTransport({
					getShuffledLibraryTracksPage: () => Promise.resolve({ hasMore: false, items: [page] }),
				}),
			};
			const component = driver.renderComponent(MixesSection, viewModel, undefined);

			tapTile(component, SHUFFLE_LIBRARY_TILE);
			await flush();

			expect(playback.playTracks).toHaveBeenCalledWith([page], 0);
		});

		valdiIt('plays the full shuffled library when offline', async (driver) => {
			const playback = mockPlaybackStore();
			const queue = [mockTrack('offline-1'), mockTrack('offline-2')];
			const viewModel = {
				connectionMode: ConnectionModes.offline,
				gridColumns: 3,
				playbackStore: playback.store,
				transport: mockTransport({ getShuffledLibraryTracks: () => Promise.resolve(queue) }),
			};
			const component = driver.renderComponent(MixesSection, viewModel, undefined);

			tapTile(component, SHUFFLE_LIBRARY_TILE);
			await flush();

			expect(playback.playTracks).toHaveBeenCalledWith(queue, 0);
		});

		valdiIt('does not play when the offline library is empty', async (driver) => {
			const playback = mockPlaybackStore();
			const viewModel = {
				connectionMode: ConnectionModes.offline,
				gridColumns: 3,
				playbackStore: playback.store,
				transport: mockTransport({ getShuffledLibraryTracks: () => Promise.resolve([]) }),
			};
			const component = driver.renderComponent(MixesSection, viewModel, undefined);

			tapTile(component, SHUFFLE_LIBRARY_TILE);
			await flush();

			expect(playback.playTracks).not.toHaveBeenCalled();
		});

		valdiIt('swallows a rejected offline fetch and does not play', async (driver) => {
			const playback = mockPlaybackStore();
			const viewModel = {
				connectionMode: ConnectionModes.offline,
				gridColumns: 3,
				playbackStore: playback.store,
				transport: mockTransport({
					getShuffledLibraryTracks: () => Promise.reject(new Error('boom')),
				}),
			};
			const component = driver.renderComponent(MixesSection, viewModel, undefined);

			tapTile(component, SHUFFLE_LIBRARY_TILE);
			await flush();

			expect(playback.playTracks).not.toHaveBeenCalled();
		});

		valdiIt('starts a background loader when more pages remain', async (driver) => {
			const playback = mockPlaybackStore();
			const viewModel = {
				connectionMode: ConnectionModes.online,
				gridColumns: 3,
				playbackStore: playback.store,
				transport: mockTransport({
					getShuffledLibraryTracksPage: () =>
						Promise.resolve({ hasMore: true, items: [mockTrack('p1')] }),
				}),
			};
			const component = driver.renderComponent(MixesSection, viewModel, undefined);

			tapTile(component, SHUFFLE_LIBRARY_TILE);
			await flush();

			expect(getInternal(component).shuffleLoader).not.toBeNull();
		});
	});

	describe('random album mix', () => {
		valdiIt('plays the tracks of the random album', async (driver) => {
			const playback = mockPlaybackStore();
			const tracks = [mockTrack('a1'), mockTrack('a2')];
			const viewModel = {
				connectionMode: ConnectionModes.online,
				gridColumns: 3,
				playbackStore: playback.store,
				transport: mockTransport({
					getRandomAlbum: () => Promise.resolve({ id: 'album-9', name: 'Nine' }),
					getTracksByAlbum: () => Promise.resolve(tracks),
				}),
			};
			const component = driver.renderComponent(MixesSection, viewModel, undefined);

			tapTile(component, RANDOM_ALBUM_TILE);
			await flush();

			expect(playback.playTracks).toHaveBeenCalledWith(tracks, 0);
		});

		valdiIt('does not play when no random album is returned', async (driver) => {
			const playback = mockPlaybackStore();
			const viewModel = {
				connectionMode: ConnectionModes.online,
				gridColumns: 3,
				playbackStore: playback.store,
				transport: mockTransport({ getRandomAlbum: () => Promise.resolve(null) }),
			};
			const component = driver.renderComponent(MixesSection, viewModel, undefined);

			tapTile(component, RANDOM_ALBUM_TILE);
			await flush();

			expect(playback.playTracks).not.toHaveBeenCalled();
		});

		valdiIt('swallows a rejected random album fetch', async (driver) => {
			const playback = mockPlaybackStore();
			const viewModel = {
				connectionMode: ConnectionModes.online,
				gridColumns: 3,
				playbackStore: playback.store,
				transport: mockTransport({ getRandomAlbum: () => Promise.reject(new Error('boom')) }),
			};
			const component = driver.renderComponent(MixesSection, viewModel, undefined);

			tapTile(component, RANDOM_ALBUM_TILE);
			await flush();

			expect(playback.playTracks).not.toHaveBeenCalled();
		});
	});

	describe('random year mix', () => {
		valdiIt('falls through empty years to the next candidate', async (driver) => {
			const playback = mockPlaybackStore();
			const yearTrack = mockTrack('y-1991');
			const viewModel = {
				connectionMode: ConnectionModes.online,
				gridColumns: 3,
				playbackStore: playback.store,
				transport: mockTransport({
					getRandomMusicYears: () => Promise.resolve([1990, 1991]),
					getTracksByYearPage: (year: number) =>
						year === 1991
							? Promise.resolve({ hasMore: false, items: [yearTrack] })
							: Promise.resolve({ hasMore: false, items: [] }),
				}),
			};
			const component = driver.renderComponent(MixesSection, viewModel, undefined);

			tapTile(component, RANDOM_YEAR_TILE);
			await flush();

			expect(playback.playTracks).toHaveBeenCalledTimes(1);
			expect(playback.playTracks).toHaveBeenCalledWith([yearTrack], 0);
		});
	});

	describe('onDestroy()', () => {
		valdiIt('disposes the active background loader', async (driver) => {
			const playback = mockPlaybackStore();
			const viewModel = {
				connectionMode: ConnectionModes.online,
				gridColumns: 3,
				playbackStore: playback.store,
				transport: mockTransport({
					getShuffledLibraryTracksPage: () =>
						Promise.resolve({ hasMore: true, items: [mockTrack('p1')] }),
				}),
			};
			const component = driver.renderComponent(MixesSection, viewModel, undefined);

			tapTile(component, SHUFFLE_LIBRARY_TILE);
			await flush();
			(getInternal(component).onDestroy as () => void)();

			expect(playback.unsubscribe).toHaveBeenCalled();
		});
	});
});
