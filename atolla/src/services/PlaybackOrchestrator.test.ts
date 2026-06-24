import { describe, expect, it, spyOn } from 'bun:test';
import type { Track } from '../models/Track';
import type { PlaybackStore } from '../stores/Playback';
import { RecentlyPlayedStore } from '../stores/RecentlyPlayed';
import { PlaybackOrchestrator, type PlaybackUserServices } from './PlaybackOrchestrator';
import type { ScrobbleService } from './ScrobbleService';
import type { TrackPlaybackNotificationNative } from './TrackPlaybackNotificationAdapter';
import type { TrackPlaybackNotificationPayload } from './TrackPlaybackNotificationSync';
import type { WaveformRenderCache } from './WaveformRenderCache';
import { WaveformService, type WaveformStore } from './WaveformService';

describe('PlaybackOrchestrator recently played', () => {
	it('records the active track as most recent', () => {
		const store = { track: makeTrack('a') as Track | null };
		const orchestrator = createOrchestrator(store);
		orchestrator.captureRecentlyPlayedTrack();
		expect(orchestrator.getRecentlyPlayedTracks().map((t) => t.id)).toEqual(['a']);
	});

	it('moves a repeated track to the front without duplicating', () => {
		const store = { track: makeTrack('a') as Track | null };
		const orchestrator = createOrchestrator(store);
		orchestrator.captureRecentlyPlayedTrack();
		store.track = makeTrack('b');
		orchestrator.captureRecentlyPlayedTrack();
		store.track = makeTrack('a');
		orchestrator.captureRecentlyPlayedTrack();
		expect(orchestrator.getRecentlyPlayedTracks().map((t) => t.id)).toEqual(['a', 'b']);
	});

	it('ignores repeated capture of the same active track', () => {
		const store = { track: makeTrack('a') as Track | null };
		const orchestrator = createOrchestrator(store);
		orchestrator.captureRecentlyPlayedTrack();
		orchestrator.captureRecentlyPlayedTrack();
		expect(orchestrator.getRecentlyPlayedTracks().map((t) => t.id)).toEqual(['a']);
	});

	it('caps history at five entries, keeping the most recent', () => {
		const store = { track: makeTrack('a') as Track | null };
		const orchestrator = createOrchestrator(store);
		for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) {
			store.track = makeTrack(id);
			orchestrator.captureRecentlyPlayedTrack();
		}
		expect(orchestrator.getRecentlyPlayedTracks().map((t) => t.id)).toEqual([
			'f',
			'e',
			'd',
			'c',
			'b',
		]);
	});

	it('forgets the last-observed track when playback stops', () => {
		const store = { track: makeTrack('a') as Track | null };
		const orchestrator = createOrchestrator(store);
		orchestrator.captureRecentlyPlayedTrack();
		store.track = null;
		orchestrator.captureRecentlyPlayedTrack();
		store.track = makeTrack('a');
		orchestrator.captureRecentlyPlayedTrack();
		expect(orchestrator.getRecentlyPlayedTracks().map((t) => t.id)).toEqual(['a']);
	});

	it('clears history on demand', () => {
		const store = { track: makeTrack('a') as Track | null };
		const orchestrator = createOrchestrator(store);
		orchestrator.captureRecentlyPlayedTrack();
		orchestrator.clearRecentlyPlayed();
		expect(orchestrator.getRecentlyPlayedTracks()).toEqual([]);
	});

	it('re-records the still-active track after clearing history', () => {
		const store = { track: makeTrack('a') as Track | null };
		const orchestrator = createOrchestrator(store);
		orchestrator.captureRecentlyPlayedTrack();
		orchestrator.clearRecentlyPlayed();
		orchestrator.captureRecentlyPlayedTrack();
		expect(orchestrator.getRecentlyPlayedTracks().map((t) => t.id)).toEqual(['a']);
	});

	it('ignores a superseded restore when user services are rebound mid-load', async () => {
		const deferred = createDeferred<string>();
		const slowStore = new RecentlyPlayedStore({
			fetchString: () => deferred.promise,
			storeString: () => Promise.resolve(),
		});
		const fastStore = new RecentlyPlayedStore();
		await fastStore.save([makeTrack('b')]);
		const orchestrator = createOrchestrator({ track: null });

		orchestrator.setUserServices(userServices({ recentlyPlayed: slowStore }));
		orchestrator.setUserServices(userServices({ recentlyPlayed: fastStore }));
		await flush();
		// the first (now-superseded) store resolves late with stale data; it must not win
		deferred.resolve(JSON.stringify([makeTrack('a')]));
		await flush();

		expect(orchestrator.getRecentlyPlayedTracks().map((t) => t.id)).toEqual(['b']);
	});

	it('restores the persisted list when user services are bound', async () => {
		const recentlyPlayed = new RecentlyPlayedStore();
		await recentlyPlayed.save([makeTrack('x'), makeTrack('y')]);
		let rerendered = false;
		const orchestrator = createOrchestrator({ track: null }, () => {
			rerendered = true;
		});

		orchestrator.setUserServices(userServices({ recentlyPlayed }));
		await flush();

		expect(orchestrator.getRecentlyPlayedTracks().map((t) => t.id)).toEqual(['x', 'y']);
		expect(rerendered).toBe(true);
	});

	it('persists captures after the restore completes', async () => {
		const recentlyPlayed = new RecentlyPlayedStore();
		const playbackStore = { track: makeTrack('a') as Track | null };
		const orchestrator = createOrchestrator(playbackStore);

		orchestrator.setUserServices(userServices({ recentlyPlayed }));
		await flush();
		playbackStore.track = makeTrack('b');
		orchestrator.captureRecentlyPlayedTrack();
		await flush();

		expect((await recentlyPlayed.load()).map((t) => t.id)).toEqual(['b', 'a']);
	});
});

describe('PlaybackOrchestrator scrobble snapshots', () => {
	it('forwards playback snapshots to the scrobble service', () => {
		const observed: Array<{ trackId: string | null; isPlaying: boolean; progressSeconds: number }> =
			[];
		const playbackStore = {
			isPlaying: true,
			progressSeconds: 12,
			seekTarget: null,
			track: makeTrack('a') as Track | null,
		};
		const orchestrator = createOrchestrator(playbackStore);

		orchestrator.setUserServices(userServices({ scrobble: fakeScrobbleService(observed) }));
		orchestrator.syncScrobblePlaybackSnapshot();

		expect(observed[observed.length - 1]).toMatchObject({
			isPlaying: true,
			progressSeconds: 12,
			trackId: 'a',
		});
	});
});

describe('PlaybackOrchestrator notification sync', () => {
	it('updates the notification with the current track payload', () => {
		const { store } = notificationPlaybackStore();
		const notification = fakeNotification();
		const orchestrator = createOrchestrator(store, () => {}, notification);

		orchestrator.syncTrackPlaybackNotification();

		expect(notification.updates).toHaveLength(1);
		expect(notification.updates[0]).toMatchObject({ isPlaying: true, trackName: 'Track a' });
	});

	it('dedupes when neither state nor position bucket changes', () => {
		const { store } = notificationPlaybackStore({ progressSeconds: 0.2 });
		const notification = fakeNotification();
		const orchestrator = createOrchestrator(store, () => {}, notification);

		orchestrator.syncTrackPlaybackNotification();
		orchestrator.syncTrackPlaybackNotification();

		expect(notification.updates).toHaveLength(1);
	});

	it('updates again when the position bucket advances', () => {
		const { store } = notificationPlaybackStore({ progressSeconds: 0 });
		const notification = fakeNotification();
		const orchestrator = createOrchestrator(store, () => {}, notification);

		orchestrator.syncTrackPlaybackNotification();
		(store as unknown as { progressSeconds: number }).progressSeconds = 1.5;
		orchestrator.syncTrackPlaybackNotification();

		expect(notification.updates).toHaveLength(2);
	});

	it('clears the notification and resets caches when nothing is playing', () => {
		const { store } = notificationPlaybackStore();
		const notification = fakeNotification();
		const orchestrator = createOrchestrator(store, () => {}, notification);

		orchestrator.syncTrackPlaybackNotification();
		store.track = null;
		orchestrator.syncTrackPlaybackNotification();
		store.track = makeTrack('a');
		orchestrator.syncTrackPlaybackNotification();

		expect(notification.clears).toBe(1);
		expect(notification.updates).toHaveLength(2);
	});

	it('does not update the notification when permission is denied', () => {
		const { store } = notificationPlaybackStore();
		const notification = fakeNotification({ permitted: false });
		const orchestrator = createOrchestrator(store, () => {}, notification);

		orchestrator.syncTrackPlaybackNotification();

		expect(notification.updates).toHaveLength(0);
	});

	it('applies a consumed next action to the playback store', () => {
		const { store, calls } = notificationPlaybackStore({
			trackIndex: 0,
			tracks: [makeTrack('a'), makeTrack('b')],
		});
		const notification = fakeNotification({ nextAction: 'next' });
		const orchestrator = createOrchestrator(store, () => {}, notification);

		orchestrator.consumeNotificationAction();

		expect(calls.next).toBe(1);
	});

	it('applies a consumed pause action to the playback store', () => {
		const { store, calls } = notificationPlaybackStore({ isPlaying: true });
		const notification = fakeNotification({ nextAction: 'pause' });
		const orchestrator = createOrchestrator(store, () => {}, notification);

		orchestrator.consumeNotificationAction();

		expect(calls.playPause).toBe(1);
	});

	it('ignores an empty or unknown consumed action', () => {
		const { store, calls } = notificationPlaybackStore();
		const notification = fakeNotification({ nextAction: 'bogus' });
		const orchestrator = createOrchestrator(store, () => {}, notification);

		orchestrator.consumeNotificationAction();

		expect(calls).toEqual({ next: 0, playPause: 0, previousOrRestart: 0, stop: 0 });
	});

	it('polls actions through start and clears the interval on dispose', () => {
		const ticks: Array<() => void> = [];
		const handle = { id: 1 } as unknown as ReturnType<typeof setInterval>;
		const setSpy = spyOn(globalThis, 'setInterval').mockImplementation(((fn: () => void) => {
			ticks.push(fn);
			return handle;
		}) as typeof setInterval);
		const clearSpy = spyOn(globalThis, 'clearInterval').mockImplementation(
			(() => {}) as typeof clearInterval,
		);
		try {
			const { store, calls } = notificationPlaybackStore();
			const notification = fakeNotification({ nextAction: 'stop' });
			const orchestrator = createOrchestrator(store, () => {}, notification);

			orchestrator.start();
			for (const tick of ticks) {
				tick();
			}
			orchestrator.dispose();

			expect(calls.stop).toBe(1);
			expect(clearSpy).toHaveBeenCalledWith(handle);
		} finally {
			setSpy.mockRestore();
			clearSpy.mockRestore();
		}
	});

	it('clears the notification on dispose when nothing is playing', () => {
		const { store } = notificationPlaybackStore({ track: null });
		const notification = fakeNotification();
		const orchestrator = createOrchestrator(store, () => {}, notification);

		orchestrator.dispose();

		expect(notification.clears).toBe(1);
	});

	it('leaves the notification untouched on dispose while a track is active', () => {
		const { store } = notificationPlaybackStore();
		const notification = fakeNotification();
		const orchestrator = createOrchestrator(store, () => {}, notification);

		orchestrator.dispose();

		expect(notification.clears).toBe(0);
	});
});

describe('PlaybackOrchestrator waveforms', () => {
	it('returns no mask until amplitude data is ready, then the rendered mask url', () => {
		const waveformService = new WaveformService(noopWaveformStore());
		const { cache: waveformRenderCache } = fakeWaveformRenderCache({ a: 'mask://a' });
		const orchestrator = createOrchestrator({ track: null });
		orchestrator.setUserServices(userServices({ waveformRenderCache, waveformService }));

		expect(orchestrator.getWaveformMaskUrl('a')).toBeNull();
		waveformService.scheduleGeneration('a');
		waveformService.onGenerationSucceeded('a', 'AMPS');

		expect(orchestrator.getWaveformMaskUrl('a')).toBe('mask://a');
	});

	it('schedules, enqueues, and reorders to playback order when enqueueing a track', () => {
		const waveformService = new WaveformService(noopWaveformStore());
		const { callbacks, state } = fakeWaveformQueue();
		const orchestrator = createOrchestrator(waveformPlaybackStore(['a', 'b'], 1));
		orchestrator.setUserServices(userServices({ ...callbacks, waveformService }));

		orchestrator.enqueueWaveformIfNeeded('a', 'path://a');

		expect(waveformService.getCount()).toBe(1);
		expect(state.enqueued).toEqual([{ audioPath: 'path://a', trackId: 'a' }]);
		expect(state.reorders[state.reorders.length - 1]).toEqual(['b', 'a']);
	});

	it('enqueues every playback-queue track with a local file, skipping those without', () => {
		const waveformService = new WaveformService(noopWaveformStore());
		const { callbacks, state } = fakeWaveformQueue();
		const orchestrator = createOrchestrator(
			waveformPlaybackStore(['a', 'b', 'c'], 1),
			() => {},
			fakeNotification(),
			{ getAudioFileUrl: (id) => (id === 'b' ? null : `path://${id}`) },
		);
		orchestrator.setUserServices(userServices({ ...callbacks, waveformService }));

		orchestrator.handleWaveformPriority();

		expect(state.enqueued.map((e) => e.trackId)).toEqual(['a', 'c']);
		expect(state.reorders[state.reorders.length - 1]).toEqual(['b', 'c', 'a']);
	});

	it('skips re-enqueueing when neither the track list nor the active index changed', () => {
		const waveformService = new WaveformService(noopWaveformStore());
		const { callbacks, state } = fakeWaveformQueue();
		const orchestrator = createOrchestrator(
			waveformPlaybackStore(['a'], 0),
			() => {},
			fakeNotification(),
			{
				getAudioFileUrl: (id) => `path://${id}`,
			},
		);
		orchestrator.setUserServices(userServices({ ...callbacks, waveformService }));

		orchestrator.handleWaveformPriority();
		orchestrator.handleWaveformPriority();

		expect(state.enqueued).toHaveLength(1);
		expect(state.reorders).toHaveLength(1);
	});

	it('does nothing before user services are bound', () => {
		const orchestrator = createOrchestrator(waveformPlaybackStore(['a']));
		expect(() => orchestrator.handleWaveformPriority()).not.toThrow();
	});

	it('reports the ready waveform count', () => {
		const waveformService = new WaveformService(noopWaveformStore());
		const orchestrator = createOrchestrator({ track: null });
		expect(orchestrator.getWaveformReadyCount()).toBe(0);

		orchestrator.setUserServices(userServices({ waveformService }));
		waveformService.scheduleGeneration('a');
		waveformService.onGenerationSucceeded('a', 'AMPS');

		expect(orchestrator.getWaveformReadyCount()).toBe(1);
	});

	it('clears amplitude data and the rendered mask cache on demand', () => {
		const waveformService = new WaveformService(noopWaveformStore());
		const { cache: waveformRenderCache, state } = fakeWaveformRenderCache();
		const orchestrator = createOrchestrator({ track: null });
		orchestrator.setUserServices(userServices({ waveformRenderCache, waveformService }));
		waveformService.scheduleGeneration('a');
		waveformService.onGenerationSucceeded('a', 'AMPS');

		orchestrator.clearWaveformData();

		expect(waveformService.getReadyCount()).toBe(0);
		expect(state.cleared).toBe(1);
	});

	it('requests an overlay rerender when the waveform service notifies', () => {
		let overlayRerenders = 0;
		const waveformService = new WaveformService(noopWaveformStore());
		const orchestrator = createOrchestrator({ track: null }, () => {}, fakeNotification(), {
			requestOverlayRerender: () => {
				overlayRerenders += 1;
			},
		});
		orchestrator.setUserServices(userServices({ waveformService }));
		const before = overlayRerenders;

		waveformService.scheduleGeneration('a');

		expect(overlayRerenders).toBeGreaterThan(before);
	});

	it('disposes the previous waveform queue when user services are rebound', () => {
		const first = fakeWaveformQueue();
		const second = fakeWaveformQueue();
		const orchestrator = createOrchestrator({ track: null });

		orchestrator.setUserServices(userServices({ ...first.callbacks }));
		orchestrator.setUserServices(userServices({ ...second.callbacks }));

		expect(first.state.disposed).toBe(1);
		expect(second.state.disposed).toBe(0);
	});

	it('disposes the waveform queue and clears the render cache on dispose', () => {
		const { callbacks, state } = fakeWaveformQueue();
		const renderCache = fakeWaveformRenderCache();
		const orchestrator = createOrchestrator({ track: null });
		orchestrator.setUserServices(
			userServices({ ...callbacks, waveformRenderCache: renderCache.cache }),
		);

		orchestrator.dispose();

		expect(state.disposed).toBe(1);
		expect(renderCache.state.cleared).toBe(1);
	});
});

function makeTrack(id: string): Track {
	return { duration: 100, id, name: `Track ${id}` } as Track;
}

interface FakeNotification extends TrackPlaybackNotificationNative {
	clears: number;
	nextAction: string;
	permitted: boolean;
	updates: Array<TrackPlaybackNotificationPayload>;
}

function fakeNotification(
	options: { nextAction?: string; permitted?: boolean } = {},
): FakeNotification {
	return {
		clear() {
			this.clears += 1;
		},
		clears: 0,
		consumeAction() {
			return this.nextAction;
		},
		ensurePermission() {
			return this.permitted;
		},
		nextAction: options.nextAction ?? '',
		permitted: options.permitted ?? true,
		update(payload: TrackPlaybackNotificationPayload) {
			this.updates.push(payload);
		},
		updates: [],
	};
}

interface ActionCalls {
	next: number;
	playPause: number;
	previousOrRestart: number;
	stop: number;
}

function notificationPlaybackStore(overrides: Record<string, unknown> = {}): {
	store: { track: Track | null };
	calls: ActionCalls;
} {
	const calls: ActionCalls = { next: 0, playPause: 0, previousOrRestart: 0, stop: 0 };
	const store = {
		album: null,
		isPlaying: true,
		next() {
			calls.next += 1;
		},
		playPause() {
			calls.playPause += 1;
		},
		previousOrRestart() {
			calls.previousOrRestart += 1;
		},
		progressSeconds: 0,
		seekTarget: null,
		stop() {
			calls.stop += 1;
		},
		track: makeTrack('a') as Track | null,
		trackIndex: 0,
		tracks: [makeTrack('a')] as Array<Track>,
		...overrides,
	};
	return { calls, store };
}

function createOrchestrator(
	playbackStore: { track: Track | null },
	requestRerender: () => void = () => {},
	notification: TrackPlaybackNotificationNative = fakeNotification(),
	opts: {
		getAudioFileUrl?: (trackId: string) => string | null;
		requestOverlayRerender?: () => void;
	} = {},
): PlaybackOrchestrator {
	return new PlaybackOrchestrator({
		getAudioFileUrl: opts.getAudioFileUrl ?? (() => null),
		notification,
		playbackStore: playbackStore as unknown as PlaybackStore,
		requestOverlayRerender: opts.requestOverlayRerender ?? (() => {}),
		requestRerender,
	});
}

function noopWaveformStore(): WaveformStore {
	return { load: () => Promise.resolve({}), save: () => Promise.resolve() };
}

function fakeWaveformQueue(): {
	callbacks: Pick<
		PlaybackUserServices,
		'disposeWaveformQueue' | 'enqueueWaveform' | 'reorderWaveformQueue'
	>;
	state: {
		enqueued: Array<{ trackId: string; audioPath: string }>;
		reorders: Array<Array<string>>;
		disposed: number;
	};
} {
	const state = {
		disposed: 0,
		enqueued: [] as Array<{ trackId: string; audioPath: string }>,
		reorders: [] as Array<Array<string>>,
	};
	return {
		callbacks: {
			disposeWaveformQueue: () => {
				state.disposed += 1;
			},
			enqueueWaveform: (trackId: string, audioPath: string) => {
				state.enqueued.push({ audioPath, trackId });
			},
			reorderWaveformQueue: (trackIds: Array<string>) => {
				state.reorders.push(trackIds);
			},
		},
		state,
	};
}

function fakeWaveformRenderCache(urls: Record<string, string> = {}): {
	cache: WaveformRenderCache;
	state: { cleared: number };
} {
	const state = { cleared: 0 };
	const cache = {
		clear: () => {
			state.cleared += 1;
		},
		getOrRequest: (trackId: string) => urls[trackId] ?? null,
		subscribe: () => () => {},
	} as unknown as WaveformRenderCache;
	return { cache, state };
}

function userServices(overrides: Partial<PlaybackUserServices> = {}): PlaybackUserServices {
	return {
		...fakeWaveformQueue().callbacks,
		recentlyPlayed: new RecentlyPlayedStore(),
		scrobble: fakeScrobbleService(),
		waveformRenderCache: fakeWaveformRenderCache().cache,
		waveformService: new WaveformService(noopWaveformStore()),
		...overrides,
	};
}

function waveformPlaybackStore(
	trackIds: Array<string>,
	trackIndex = 0,
): { track: Track | null; trackIndex: number; tracks: Array<Track> } {
	const tracks = trackIds.map(makeTrack);
	return { track: tracks[trackIndex] ?? null, trackIndex, tracks };
}

function fakeScrobbleService(
	observed: Array<{ trackId: string | null; isPlaying: boolean; progressSeconds: number }> = [],
): ScrobbleService {
	return {
		observePlayback: (snapshot: {
			trackId: string | null;
			isPlaying: boolean;
			progressSeconds: number;
		}) => observed.push(snapshot),
		onAppReady: () => Promise.resolve(),
	} as unknown as ScrobbleService;
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function createDeferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}
