import 'jasmine/src/jasmine';
import type { Album } from 'atolla/src/models/Album';
import type { Track } from 'atolla/src/models/Track';
import type { PlaybackStore } from 'atolla/src/stores/Playback';
import type { Transport } from 'atolla/src/transports/Transport';
import { CardContextMenu } from 'atolla/src/ui/components/CardContextMenu';
import { createComponent, valdiIt } from 'valdi_test/test/JSXTestUtils';

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

function mockTransport(overrides: Record<string, unknown> = {}): Transport {
	return {
		getArtistLogoUrl: () => Promise.resolve(null),
		getTracksByAlbum: () => Promise.resolve([mockTrack()]),
		getTracksByArtist: () => Promise.resolve([mockTrack()]),
		getTracksByGenre: () => Promise.resolve([mockTrack()]),
		getTracksByPlaylist: () => Promise.resolve([mockTrack()]),
		...overrides,
	} as unknown as Transport;
}

// Drains the microtask queue so the fire-and-forget fetch chain settles.
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
		valdiIt('plays the fetched tracks and dismisses with the toast', async () => {
			const play = jasmine.createSpy('play');
			const onDismiss = jasmine.createSpy('onDismiss');
			const instrumented = createComponent(CardContextMenu, {
				animationsEnabled: false,
				card: { album: mockAlbum(), kind: 'album' },
				onDismiss,
				playbackStore: {
					play,
					playTracks: jasmine.createSpy('playTracks'),
				} as unknown as PlaybackStore,
				transport: mockTransport(),
			});

			(getInternal(instrumented.getComponent()).handlePlay as () => void)();
			await flush();

			expect(play).toHaveBeenCalled();
			expect(onDismiss).toHaveBeenCalled();
		});

		valdiIt('swallows a rejected fetch: still dismisses and does not play', async () => {
			const play = jasmine.createSpy('play');
			const onDismiss = jasmine.createSpy('onDismiss');
			const instrumented = createComponent(CardContextMenu, {
				animationsEnabled: false,
				card: { album: mockAlbum(), kind: 'album' },
				onDismiss,
				playbackStore: {
					play,
					playTracks: jasmine.createSpy('playTracks'),
				} as unknown as PlaybackStore,
				transport: mockTransport({ getTracksByAlbum: () => Promise.reject(new Error('boom')) }),
			});

			(getInternal(instrumented.getComponent()).handlePlay as () => void)();
			await flush();

			// A failed fetch must not surface as an unhandled rejection; the menu was already
			// dismissed optimistically and nothing is played.
			expect(play).not.toHaveBeenCalled();
			expect(onDismiss).toHaveBeenCalled();
		});

		valdiIt('does not play an empty fetch result', async () => {
			const play = jasmine.createSpy('play');
			const instrumented = createComponent(CardContextMenu, {
				animationsEnabled: false,
				card: { album: mockAlbum(), kind: 'album' },
				onDismiss: jasmine.createSpy('onDismiss'),
				playbackStore: {
					play,
					playTracks: jasmine.createSpy('playTracks'),
				} as unknown as PlaybackStore,
				transport: mockTransport({ getTracksByAlbum: () => Promise.resolve([]) }),
			});

			(getInternal(instrumented.getComponent()).handlePlay as () => void)();
			await flush();

			expect(play).not.toHaveBeenCalled();
		});
	});

	describe('handleAddToQueue()', () => {
		valdiIt('swallows a rejected fetch and still dismisses', async () => {
			const addToQueue = jasmine.createSpy('addToQueue');
			const onDismiss = jasmine.createSpy('onDismiss');
			const instrumented = createComponent(CardContextMenu, {
				animationsEnabled: false,
				card: { album: mockAlbum(), kind: 'album' },
				onDismiss,
				playbackStore: { addToQueue } as unknown as PlaybackStore,
				transport: mockTransport({ getTracksByAlbum: () => Promise.reject(new Error('boom')) }),
			});

			(getInternal(instrumented.getComponent()).handleAddToQueue as () => void)();
			await flush();

			expect(addToQueue).not.toHaveBeenCalled();
			expect(onDismiss).toHaveBeenCalled();
		});
	});
});
