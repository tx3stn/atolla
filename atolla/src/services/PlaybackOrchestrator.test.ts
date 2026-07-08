import { describe, expect, it, spyOn } from 'bun:test';
import type { Track } from '../models/Track';
import type { PlaybackStore } from '../stores/Playback';
import { RecentlyPlayedStore } from '../stores/RecentlyPlayed';
import {
	PlaybackOrchestrator,
	type PlaybackUserServices,
	WAVEFORM_PREGEN_WINDOW,
} from './PlaybackOrchestrator';
import type { ScrobbleService } from './ScrobbleService';
import type { TrackPlaybackNotificationNative } from './TrackPlaybackNotificationAdapter';
import type { TrackPlaybackNotificationPayload } from './TrackPlaybackNotificationSync';
import type { TrackSourceNative } from './TrackSourceNativeAdapter';
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

	it('performs an initial notification sync in start for a track already active', () => {
		const setSpy = spyOn(globalThis, 'setInterval').mockImplementation((() => ({
			id: 1,
		})) as unknown as typeof setInterval);
		try {
			const { store } = notificationPlaybackStore();
			const notification = fakeNotification();
			const orchestrator = createOrchestrator(store, () => {}, notification);

			orchestrator.start();

			expect(notification.updates.length).toBe(1);
		} finally {
			setSpy.mockRestore();
		}
	});

	it('clears the notification in start when no track is active at boot', () => {
		const setSpy = spyOn(globalThis, 'setInterval').mockImplementation((() => ({
			id: 1,
		})) as unknown as typeof setInterval);
		try {
			const { store } = notificationPlaybackStore({ track: null });
			const notification = fakeNotification();
			const orchestrator = createOrchestrator(store, () => {}, notification);

			orchestrator.start();

			expect(notification.clears).toBe(1);
		} finally {
			setSpy.mockRestore();
		}
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

	it('enqueues in-window tracks with a local file, skipping those without', () => {
		const waveformService = new WaveformService(noopWaveformStore());
		const { callbacks, state } = fakeWaveformQueue();
		const orchestrator = createOrchestrator(
			waveformPlaybackStore(['a', 'b'], 0),
			() => {},
			fakeNotification(),
			{ getAudioFileUrl: (id) => (id === 'b' ? null : `path://${id}`) },
		);
		orchestrator.setUserServices(userServices({ ...callbacks, waveformService }));

		orchestrator.handleWaveformPriority();

		// 'b' has no local file so it is skipped; 'a' (the current track) is enqueued
		expect(state.enqueued.map((e) => e.trackId)).toEqual(['a']);
		expect(state.reorders[state.reorders.length - 1]).toEqual(['a', 'b']);
	});

	it('caps waveform pre-generation to a forward window from the current track', () => {
		const waveformService = new WaveformService(noopWaveformStore());
		const { callbacks, state } = fakeWaveformQueue();
		const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
		const currentIndex = 1;
		const orchestrator = createOrchestrator(
			waveformPlaybackStore(ids, currentIndex),
			() => {},
			fakeNotification(),
			{ getAudioFileUrl: (id) => `path://${id}` },
		);
		orchestrator.setUserServices(userServices({ ...callbacks, waveformService }));

		orchestrator.handleWaveformPriority();

		// only the current track and the next tracks within the window are pre-generated; the behind
		// 'a' and everything past the window are excluded
		const expected = ids.slice(currentIndex, currentIndex + WAVEFORM_PREGEN_WINDOW);
		expect(state.enqueued.map((e) => e.trackId)).toEqual(expected);
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

describe('PlaybackOrchestrator playback subscription', () => {
	it('subscribes in start and fires onPlaybackTick behind the gate, after the pre-gate syncs', () => {
		const sequence: Array<string> = [];
		const scrobble = {
			getPendingScrobbles: () => [],
			observePlayback: () => sequence.push('scrobble'),
			onAppReady: () => Promise.resolve(),
		} as unknown as ScrobbleService;
		const { store, notify } = subscribablePlaybackStore();
		const orchestrator = createOrchestrator(store, () => {}, fakeNotification(), {
			onPlaybackTick: () => sequence.push('tick'),
		});
		orchestrator.setUserServices(userServices({ scrobble }));
		orchestrator.start();

		sequence.length = 0;
		notify();
		orchestrator.dispose();

		expect(sequence).toEqual(['scrobble', 'tick']);
	});

	it('runs the pre-gate syncs every tick even when the gate suppresses onPlaybackTick', () => {
		const observed: Array<{
			trackId: string | null;
			isPlaying: boolean;
			progressSeconds: number;
		}> = [];
		const { store, notify } = subscribablePlaybackStore();
		let tickCount = 0;
		const orchestrator = createOrchestrator(store, () => {}, fakeNotification(), {
			onPlaybackTick: () => {
				tickCount += 1;
			},
		});
		orchestrator.setUserServices(userServices({ scrobble: fakeScrobbleService(observed) }));
		orchestrator.start();

		observed.length = 0;
		notify();
		notify();
		orchestrator.dispose();

		expect(observed.length).toBe(2);
		expect(tickCount).toBe(1);
	});

	it('re-runs onPlaybackTick after a >1s gap (backgrounding signature reset)', () => {
		let nowValue = 1000;
		const nowSpy = spyOn(Date, 'now').mockImplementation(() => nowValue);
		try {
			const { store, notify } = subscribablePlaybackStore();
			let tickCount = 0;
			const orchestrator = createOrchestrator(store, () => {}, fakeNotification(), {
				onPlaybackTick: () => {
					tickCount += 1;
				},
			});
			orchestrator.start();

			notify();
			nowValue = 1500;
			notify();
			nowValue = 3000;
			notify();
			orchestrator.dispose();

			expect(tickCount).toBe(2);
		} finally {
			nowSpy.mockRestore();
		}
	});

	it('does not fire onPlaybackTick after dispose', () => {
		const { store, notify } = subscribablePlaybackStore();
		let tickCount = 0;
		const orchestrator = createOrchestrator(store, () => {}, fakeNotification(), {
			onPlaybackTick: () => {
				tickCount += 1;
			},
		});
		orchestrator.start();
		orchestrator.dispose();

		notify();

		expect(tickCount).toBe(0);
	});
});

describe('PlaybackOrchestrator lifecycle ownership', () => {
	it('reads the recently-played raw blob through the bound store, undefined before binding', async () => {
		const recentlyPlayed = new RecentlyPlayedStore();
		await recentlyPlayed.save([makeTrack('a')]);
		const orchestrator = createOrchestrator({ track: null });

		expect(await orchestrator.getRecentlyPlayedRaw()).toBeUndefined();
		orchestrator.setUserServices(userServices({ recentlyPlayed }));

		expect(await orchestrator.getRecentlyPlayedRaw()).toBe(JSON.stringify([makeTrack('a')]));
	});

	it('reads the pending scrobble count through the bound service, undefined before binding', () => {
		const { service } = trackingScrobbleService(3);
		const orchestrator = createOrchestrator({ track: null });

		expect(orchestrator.getPendingScrobbleCount()).toBeUndefined();
		orchestrator.setUserServices(userServices({ scrobble: service }));

		expect(orchestrator.getPendingScrobbleCount()).toBe(3);
	});

	it('invokes scrobble onAppReady when user services are bound', () => {
		const { service, state } = trackingScrobbleService();
		const orchestrator = createOrchestrator({ track: null });

		orchestrator.setUserServices(userServices({ scrobble: service }));

		expect(state.appReadyCalls).toBe(1);
	});

	it('notifyAppReady forwards to scrobble onAppReady when bound and is a no-op before', () => {
		const { service, state } = trackingScrobbleService();
		const orchestrator = createOrchestrator({ track: null });

		orchestrator.notifyAppReady();
		expect(state.appReadyCalls).toBe(0);

		orchestrator.setUserServices(userServices({ scrobble: service }));
		orchestrator.notifyAppReady();

		expect(state.appReadyCalls).toBe(2);
	});
});

describe('PlaybackOrchestrator artwork palette', () => {
	function artworkStore(albumImageUrl: string | null): { track: Track | null; album: null } {
		return {
			album: null,
			track:
				albumImageUrl === null
					? makeTrack('a')
					: ({ albumImageUrl, duration: 100, id: 'a', name: 'Track a' } as Track),
		};
	}

	it('warms up artwork and prioritizes palette generation when none is cached', async () => {
		const palette = fakePalette();
		const prewarmed: Array<string> = [];
		const orchestrator = createOrchestrator(artworkStore('art://a'), () => {}, fakeNotification(), {
			prewarmArtwork: (imageUrl) => prewarmed.push(imageUrl),
		});
		orchestrator.setUserServices(
			userServices({ paletteQueue: palette.queue, paletteService: palette.service }),
		);

		orchestrator.handleAlbumChange();
		await flush();

		expect(prewarmed).toEqual(['art://a']);
		expect(palette.state.warmedUp).toEqual([['art://a']]);
		expect(palette.state.prioritized).toEqual(['art://a']);
	});

	it('skips prioritizing when the artwork already has a palette', async () => {
		const palette = fakePalette();
		palette.state.hasPaletteFor.add('art://a');
		const orchestrator = createOrchestrator(artworkStore('art://a'));
		orchestrator.setUserServices(
			userServices({ paletteQueue: palette.queue, paletteService: palette.service }),
		);

		orchestrator.handleAlbumChange();
		await flush();

		expect(palette.state.warmedUp).toEqual([['art://a']]);
		expect(palette.state.prioritized).toEqual([]);
	});

	it('skips repeated work when the artwork url is unchanged', async () => {
		const palette = fakePalette();
		const orchestrator = createOrchestrator(artworkStore('art://a'));
		orchestrator.setUserServices(
			userServices({ paletteQueue: palette.queue, paletteService: palette.service }),
		);

		orchestrator.handleAlbumChange();
		await flush();
		orchestrator.handleAlbumChange();
		await flush();

		expect(palette.state.warmedUp.length).toBe(1);
	});

	it('does nothing before user services are bound', () => {
		const prewarmed: Array<string> = [];
		const orchestrator = createOrchestrator(artworkStore('art://a'), () => {}, fakeNotification(), {
			prewarmArtwork: (imageUrl) => prewarmed.push(imageUrl),
		});

		orchestrator.handleAlbumChange();

		expect(prewarmed).toEqual([]);
	});

	it('resolves the current artist logo and rerenders the overlay', async () => {
		const setLogo: Array<string | null> = [];
		let overlayRerenders = 0;
		const store = {
			setArtistLogoUrl: (url: string | null) => setLogo.push(url),
			track: null,
			unresolvedArtistLogoArtistId: 'artist-1' as string | null,
		};
		const orchestrator = createOrchestrator(store, () => {}, fakeNotification(), {
			requestOverlayRerender: () => {
				overlayRerenders += 1;
			},
			resolveArtistLogoUrl: () => Promise.resolve('logo://1'),
		});

		orchestrator.resolveCurrentArtistLogo();
		await flush();

		expect(setLogo).toEqual(['logo://1']);
		expect(overlayRerenders).toBe(1);
	});

	it('dedupes concurrent resolution of the same artist', () => {
		let calls = 0;
		const deferred = createDeferred<string | null>();
		const store = {
			setArtistLogoUrl: () => {},
			track: null,
			unresolvedArtistLogoArtistId: 'artist-1' as string | null,
		};
		const orchestrator = createOrchestrator(store, () => {}, fakeNotification(), {
			resolveArtistLogoUrl: () => {
				calls += 1;
				return deferred.promise;
			},
		});

		orchestrator.resolveCurrentArtistLogo();
		orchestrator.resolveCurrentArtistLogo();

		expect(calls).toBe(1);
	});

	it('bails when the current track changed during resolution', async () => {
		const setLogo: Array<string | null> = [];
		const store = {
			setArtistLogoUrl: (url: string | null) => setLogo.push(url),
			track: null,
			unresolvedArtistLogoArtistId: 'artist-1' as string | null,
		};
		const orchestrator = createOrchestrator(store, () => {}, fakeNotification(), {
			resolveArtistLogoUrl: () => Promise.resolve('logo://1'),
		});

		orchestrator.resolveCurrentArtistLogo();
		store.unresolvedArtistLogoArtistId = 'artist-2';
		await flush();

		expect(setLogo).toEqual([]);
	});
});

describe('PlaybackOrchestrator playback sources', () => {
	function sourceStore(
		trackIds: Array<string>,
		trackIndex = 0,
		loopMode = 'none',
	): { track: Track | null; trackIndex: number; tracks: Array<Track>; loopMode: string } {
		const tracks = trackIds.map(makeTrack);
		return { loopMode, track: tracks[trackIndex] ?? null, trackIndex, tracks };
	}

	it('applies the current source and computes the next from the resolver', () => {
		let rerenders = 0;
		const orchestrator = createOrchestrator(
			sourceStore(['a', 'b']),
			() => {
				rerenders += 1;
			},
			fakeNotification(),
			{ getTrackCacheUrl: (id) => `src://${id}` },
		);

		orchestrator.applyPlaybackSources('src://a');

		expect(orchestrator.getTrackPlaybackSourceUrl()).toBe('src://a');
		expect(orchestrator.getNextTrackSourceUrl()).toBe('src://b');
		expect(rerenders).toBe(1);
	});

	it('does not rerender when the sources are unchanged', () => {
		let rerenders = 0;
		const orchestrator = createOrchestrator(
			sourceStore(['a', 'b']),
			() => {
				rerenders += 1;
			},
			fakeNotification(),
			{ getTrackCacheUrl: (id) => `src://${id}` },
		);

		orchestrator.applyPlaybackSources('src://a');
		orchestrator.applyPlaybackSources('src://a');

		expect(rerenders).toBe(1);
	});

	it('preloads only the next source', () => {
		const orchestrator = createOrchestrator(sourceStore(['a', 'b']), () => {}, fakeNotification(), {
			getTrackCacheUrl: (id) => `src://${id}`,
		});

		orchestrator.handleNextTrackPreload();

		expect(orchestrator.getNextTrackSourceUrl()).toBe('src://b');
		expect(orchestrator.getTrackPlaybackSourceUrl()).toBeNull();
	});

	it('returns no next source at the end of a non-looping queue', () => {
		const orchestrator = createOrchestrator(
			sourceStore(['a', 'b'], 1),
			() => {},
			fakeNotification(),
			{ getTrackCacheUrl: (id) => `src://${id}` },
		);

		orchestrator.handleNextTrackPreload();

		expect(orchestrator.getNextTrackSourceUrl()).toBeNull();
	});

	it('wraps to the first track when the queue loops', () => {
		const orchestrator = createOrchestrator(
			sourceStore(['a', 'b'], 1, 'queue'),
			() => {},
			fakeNotification(),
			{ getTrackCacheUrl: (id) => `src://${id}` },
		);

		orchestrator.handleNextTrackPreload();

		expect(orchestrator.getNextTrackSourceUrl()).toBe('src://a');
	});

	it('overrides only the current source, leaving next intact', () => {
		const orchestrator = createOrchestrator(sourceStore(['a', 'b']), () => {}, fakeNotification(), {
			getTrackCacheUrl: (id) => `src://${id}`,
		});

		orchestrator.applyPlaybackSources('src://a');
		orchestrator.setTrackPlaybackSource('file://a-alt');

		expect(orchestrator.getTrackPlaybackSourceUrl()).toBe('file://a-alt');
		expect(orchestrator.getNextTrackSourceUrl()).toBe('src://b');
	});

	it('resets both sources', () => {
		const orchestrator = createOrchestrator(sourceStore(['a', 'b']), () => {}, fakeNotification(), {
			getTrackCacheUrl: (id) => `src://${id}`,
		});

		orchestrator.applyPlaybackSources('src://a');
		orchestrator.resetPlaybackSources();

		expect(orchestrator.getTrackPlaybackSourceUrl()).toBeNull();
		expect(orchestrator.getNextTrackSourceUrl()).toBeNull();
	});
});

describe('PlaybackOrchestrator upcoming queue', () => {
	function queueStore(): {
		track: Track | null;
		trackIndex: number;
		tracks: Array<Track>;
		loopMode: string;
	} {
		const tracks = [makeTrack('a'), makeTrack('b')];
		return { loopMode: 'none', track: tracks[0], trackIndex: 0, tracks };
	}

	it('serializes the queue window and pushes it to the native callback', () => {
		const trackSourceNative = fakeTrackSourceNative();
		const orchestrator = createOrchestrator(queueStore(), () => {}, fakeNotification(), {
			getTrackCacheUrl: (id) => `src://${id}`,
			trackSourceNative,
		});

		orchestrator.syncUpcomingQueue();

		expect(trackSourceNative.upcomingQueuePayloads.length).toBe(1);
		const window = JSON.parse(trackSourceNative.upcomingQueuePayloads[0]) as {
			currentIndex: number;
			entries: Array<{ sourceUrl: string; trackId: string }>;
		};
		expect(window.currentIndex).toBe(0);
		expect(window.entries.map((entry) => entry.sourceUrl)).toEqual(['src://a', 'src://b']);
	});

	it('pushes a fresh payload when the window changes', () => {
		const trackSourceNative = fakeTrackSourceNative();
		const store = queueStore();
		const orchestrator = createOrchestrator(store, () => {}, fakeNotification(), {
			getTrackCacheUrl: (id) => `src://${id}`,
			trackSourceNative,
		});

		orchestrator.syncUpcomingQueue();
		store.trackIndex = 1;
		orchestrator.syncUpcomingQueue();

		expect(trackSourceNative.upcomingQueuePayloads.length).toBe(2);
	});

	it('dedupes when the serialized window is unchanged', () => {
		const trackSourceNative = fakeTrackSourceNative();
		const orchestrator = createOrchestrator(queueStore(), () => {}, fakeNotification(), {
			getTrackCacheUrl: (id) => `src://${id}`,
			trackSourceNative,
		});

		orchestrator.syncUpcomingQueue();
		orchestrator.syncUpcomingQueue();

		expect(trackSourceNative.upcomingQueuePayloads.length).toBe(1);
	});
});

describe('PlaybackOrchestrator track source routing', () => {
	function routingStore(isPlaying = true): {
		album: null;
		isPlaying: boolean;
		loopMode: string;
		track: Track | null;
		trackIndex: number;
		tracks: Array<Track>;
	} {
		return {
			album: null,
			isPlaying,
			loopMode: 'none',
			track: makeTrack('a'),
			trackIndex: 0,
			tracks: [makeTrack('a')],
		};
	}

	it('applies the native cached source when present', () => {
		const trackSourceNative = fakeTrackSourceNative({
			getCachedTrackFileUrl: (id) => (id === 'a' ? '/cache/a' : ''),
		});
		const orchestrator = createOrchestrator(routingStore(), () => {}, fakeNotification(), {
			trackSourceNative,
		});

		const applied = orchestrator.handleTrackPlaybackSourceChange();

		expect(applied).toBe(true);
		expect(orchestrator.getTrackPlaybackSourceUrl()).toBe('/cache/a');
	});

	it('falls back to the stream source when nothing is cached', () => {
		const orchestrator = createOrchestrator(routingStore(false), () => {}, fakeNotification(), {
			getTrackCacheUrl: (id) => `https://${id}`,
		});

		orchestrator.handleTrackPlaybackSourceChange();

		expect(orchestrator.getTrackPlaybackSourceUrl()).toBe('https://a');
	});

	it('fetches the current track while paused so its waveform and resume are ready', () => {
		const cacheCalls: Array<{ trackId: string; url: string }> = [];
		const trackSourceNative = fakeTrackSourceNative({
			cacheTrackFromUrl: (trackId, url) => {
				cacheCalls.push({ trackId, url });
			},
		});
		const orchestrator = createOrchestrator(routingStore(false), () => {}, fakeNotification(), {
			getTrackCacheUrl: (id) => `https://${id}`,
			trackSourceNative,
		});

		orchestrator.handleTrackPlaybackSourceChange();

		expect(cacheCalls).toEqual([{ trackId: 'a', url: 'https://a' }]);
	});

	it('defers the current track download while playing so the initial buffer stays uncontended', () => {
		const cacheCalls: Array<string> = [];
		const trackSourceNative = fakeTrackSourceNative({
			cacheTrackFromUrl: (trackId) => {
				cacheCalls.push(trackId);
			},
		});
		const orchestrator = createOrchestrator(routingStore(true), () => {}, fakeNotification(), {
			getTrackCacheUrl: (id) => `https://${id}`,
			trackSourceNative,
		});

		orchestrator.handleTrackPlaybackSourceChange();

		expect(cacheCalls).toEqual([]);
		orchestrator.dispose();
	});

	it('does not fetch the current track while paused in offline mode', () => {
		const cacheCalls: Array<string> = [];
		const trackSourceNative = fakeTrackSourceNative({
			cacheTrackFromUrl: (trackId) => {
				cacheCalls.push(trackId);
			},
		});
		const orchestrator = createOrchestrator(routingStore(false), () => {}, fakeNotification(), {
			getTrackCacheUrl: (id) => `https://${id}`,
			isOfflinePlaybackMode: () => true,
			trackSourceNative,
		});

		orchestrator.handleTrackPlaybackSourceChange();

		expect(cacheCalls).toEqual([]);
	});

	it('does not route a local file:// current-track source to the HTTP cache', () => {
		const cacheCalls: Array<string> = [];
		const trackSourceNative = fakeTrackSourceNative({
			cacheTrackFromUrl: (trackId) => {
				cacheCalls.push(trackId);
			},
		});
		const orchestrator = createOrchestrator(routingStore(false), () => {}, fakeNotification(), {
			getTrackCacheUrl: (id) => `file://${id}`,
			trackSourceNative,
		});

		orchestrator.handleTrackPlaybackSourceChange();

		expect(cacheCalls).toEqual([]);
	});

	it('toasts on playback error', () => {
		const toasts: Array<string> = [];
		const orchestrator = createOrchestrator({ track: null }, () => {}, fakeNotification(), {
			showPlaybackToast: (message) => toasts.push(message),
		});

		orchestrator.handlePlaybackError('boom');

		expect(toasts).toEqual(['playback error: boom']);
	});

	it('marks the active track complete at its full duration', () => {
		const progress: Array<number> = [];
		const store = {
			track: makeTrack('a') as Track | null,
			updateProgress: (seconds: number) => progress.push(seconds),
		};
		const orchestrator = createOrchestrator(store);

		orchestrator.handleTrackCompleted();

		expect(progress).toEqual([100]);
	});
});

describe('PlaybackOrchestrator cached current track source stability', () => {
	function playingStore(
		tracks: Array<Track>,
		trackIndex = 0,
	): {
		album: null;
		isPlaying: boolean;
		loopMode: string;
		track: Track | null;
		trackIndex: number;
		tracks: Array<Track>;
	} {
		return {
			album: null,
			isPlaying: true,
			loopMode: 'none',
			track: tracks[trackIndex] ?? null,
			trackIndex,
			tracks,
		};
	}

	it('keeps the current track streaming when its download completes mid-playback', () => {
		const cachedFiles: Record<string, string> = {};
		let rerenders = 0;
		const trackSourceNative = fakeTrackSourceNative({
			getCachedTrackFileUrl: (id) => cachedFiles[id] ?? '',
		});
		const orchestrator = createOrchestrator(
			playingStore([makeTrack('a')]),
			() => {
				rerenders += 1;
			},
			fakeNotification(),
			{ getTrackCacheUrl: (id) => `https://${id}`, trackSourceNative },
		);

		orchestrator.handleTrackPlaybackSourceChange();
		expect(orchestrator.getTrackPlaybackSourceUrl()).toBe('https://a');
		const rerendersAfterBind = rerenders;

		cachedFiles.a = '/cache/a';
		orchestrator.handleTrackCached('a');

		expect(orchestrator.getTrackPlaybackSourceUrl()).toBe('https://a');
		expect(rerenders).toBe(rerendersAfterBind);
		orchestrator.dispose();
	});

	it('still generates the waveform from the cached file for the current track', () => {
		const cachedFiles: Record<string, string> = {};
		const waveform = fakeWaveformQueue();
		const trackSourceNative = fakeTrackSourceNative({
			getCachedTrackFileUrl: (id) => cachedFiles[id] ?? '',
		});
		const orchestrator = createOrchestrator(
			playingStore([makeTrack('a')]),
			() => {},
			fakeNotification(),
			{
				getAudioFileUrl: (id) => (id === 'a' ? '/audio/a' : null),
				getTrackCacheUrl: (id) => `https://${id}`,
				trackSourceNative,
			},
		);
		orchestrator.setUserServices(userServices({ ...waveform.callbacks }));

		orchestrator.handleTrackPlaybackSourceChange();
		cachedFiles.a = '/cache/a';
		orchestrator.handleTrackCached('a');

		expect(waveform.state.enqueued).toContainEqual({ audioPath: '/audio/a', trackId: 'a' });
		expect(orchestrator.getTrackPlaybackSourceUrl()).toBe('https://a');
		orchestrator.dispose();
	});

	it('refreshes the upcoming queue with the cached source when the current caches', () => {
		const cachedFiles: Record<string, string> = {};
		const trackSourceNative = fakeTrackSourceNative({
			getCachedTrackFileUrl: (id) => cachedFiles[id] ?? '',
		});
		const orchestrator = createOrchestrator(
			playingStore([makeTrack('a'), makeTrack('b')]),
			() => {},
			fakeNotification(),
			{ getTrackCacheUrl: (id) => `https://${id}`, trackSourceNative },
		);

		orchestrator.handleTrackPlaybackSourceChange();
		orchestrator.syncUpcomingQueue();
		const payloadsAfterBind = trackSourceNative.upcomingQueuePayloads.length;

		cachedFiles.a = '/cache/a';
		orchestrator.handleTrackCached('a');

		expect(trackSourceNative.upcomingQueuePayloads.length).toBeGreaterThan(payloadsAfterBind);
		orchestrator.dispose();
	});

	it('binds the cached file when the current source was never resolved', () => {
		const cachedFiles: Record<string, string> = { a: '/cache/a' };
		const trackSourceNative = fakeTrackSourceNative({
			getCachedTrackFileUrl: (id) => cachedFiles[id] ?? '',
		});
		const orchestrator = createOrchestrator(
			playingStore([makeTrack('a')]),
			() => {},
			fakeNotification(),
			{ getTrackCacheUrl: (id) => `https://${id}`, trackSourceNative },
		);

		expect(orchestrator.getTrackPlaybackSourceUrl()).toBeNull();
		orchestrator.handleTrackCached('a');

		expect(orchestrator.getTrackPlaybackSourceUrl()).toBe('/cache/a');
		orchestrator.dispose();
	});

	it('does not schedule a source-format retry on source-bound', () => {
		const orchestrator = createOrchestrator(playingStore([makeTrack('a')]));
		const setTimeoutSpy = spyOn(globalThis, 'setTimeout');
		try {
			orchestrator.handlePlaybackEvent('source-bound');
			expect(setTimeoutSpy).not.toHaveBeenCalled();
		} finally {
			setTimeoutSpy.mockRestore();
		}
		orchestrator.dispose();
	});
});

describe('PlaybackOrchestrator upcoming palettes', () => {
	it('prewarms album art and enqueues palettes for the up-next window', async () => {
		const palette = fakePalette();
		const cached: Array<string> = [];
		const orchestrator = createOrchestrator(
			palettePlaybackStore(4, 0),
			() => {},
			fakeNotification(),
			{
				cacheAlbumArt: (url) => {
					cached.push(url);
					return Promise.resolve();
				},
			},
		);
		orchestrator.setUserServices(
			userServices({ paletteQueue: palette.queue, paletteService: palette.service }),
		);

		orchestrator.prewarmUpcomingPalettes();
		await flush();

		expect(palette.state.warmedUp).toEqual([['art://1', 'art://2', 'art://3']]);
		expect(cached).toEqual(['art://1', 'art://2', 'art://3']);
		expect(palette.state.enqueued).toEqual(['art://1', 'art://2', 'art://3']);
	});

	it('skips the current artwork and tracks that already have a palette', async () => {
		const palette = fakePalette();
		palette.state.hasPaletteFor.add('art://b');
		const tracks = [
			{ albumImageUrl: 'art://a', duration: 100, id: 'a', name: 'A' },
			{ albumImageUrl: 'art://b', duration: 100, id: 'b', name: 'B' },
			{ albumImageUrl: 'art://a', duration: 100, id: 'c', name: 'C' },
			{ albumImageUrl: 'art://d', duration: 100, id: 'd', name: 'D' },
		] as Array<Track>;
		const store: { track: Track | null; trackIndex: number; tracks: Array<Track> } = {
			track: tracks[0],
			trackIndex: 0,
			tracks,
		};
		const orchestrator = createOrchestrator(store, () => {}, fakeNotification());
		orchestrator.setUserServices(
			userServices({ paletteQueue: palette.queue, paletteService: palette.service }),
		);

		orchestrator.handleAlbumChange();
		orchestrator.prewarmUpcomingPalettes();
		await flush();

		expect(palette.state.enqueued).toEqual(['art://d']);
	});

	it('bounds the lookahead to the prewarm count', async () => {
		const palette = fakePalette();
		const orchestrator = createOrchestrator(
			palettePlaybackStore(15, 0),
			() => {},
			fakeNotification(),
		);
		orchestrator.setUserServices(
			userServices({ paletteQueue: palette.queue, paletteService: palette.service }),
		);

		orchestrator.prewarmUpcomingPalettes();
		await flush();

		expect(palette.state.enqueued).toHaveLength(10);
		expect(palette.state.enqueued).toContain('art://10');
		expect(palette.state.enqueued).not.toContain('art://11');
	});

	it('does not repeat work until the queue or index changes', async () => {
		const palette = fakePalette();
		const store = palettePlaybackStore(6, 0);
		const orchestrator = createOrchestrator(store, () => {}, fakeNotification());
		orchestrator.setUserServices(
			userServices({ paletteQueue: palette.queue, paletteService: palette.service }),
		);

		orchestrator.prewarmUpcomingPalettes();
		orchestrator.prewarmUpcomingPalettes();
		await flush();
		expect(palette.state.warmedUp).toHaveLength(1);

		store.trackIndex = 1;
		orchestrator.prewarmUpcomingPalettes();
		await flush();
		expect(palette.state.warmedUp).toHaveLength(2);
		expect(palette.state.enqueued).toContain('art://5');
	});

	it('does nothing before user services are bound', () => {
		const orchestrator = createOrchestrator(palettePlaybackStore(3, 0));
		expect(() => orchestrator.prewarmUpcomingPalettes()).not.toThrow();
	});

	it('defers upcoming album-art downloads behind the playback cushion while streaming', async () => {
		const palette = fakePalette();
		const cached: Array<string> = [];
		const tracks = [
			{ albumImageUrl: 'art://a', duration: 100, id: 'a', name: 'A' },
			{ albumImageUrl: 'art://b', duration: 100, id: 'b', name: 'B' },
		] as Array<Track>;
		const store = {
			album: null,
			isPlaying: true,
			loopMode: 'none',
			track: tracks[0] as Track | null,
			trackIndex: 0,
			tracks,
		};
		const trackSourceNative = fakeTrackSourceNative({ getCachedTrackFileUrl: () => '' });
		const orchestrator = createOrchestrator(store, () => {}, fakeNotification(), {
			cacheAlbumArt: (url) => {
				cached.push(url);
				return Promise.resolve();
			},
			getTrackCacheUrl: (id) => `https://${id}`,
			trackSourceNative,
		});
		orchestrator.setUserServices(
			userServices({ paletteQueue: palette.queue, paletteService: palette.service }),
		);

		orchestrator.handleTrackPlaybackSourceChange();
		orchestrator.prewarmUpcomingPalettes();
		await flush();
		expect(cached).toEqual([]);

		orchestrator.handlePlaybackEvent('playback-cushion');
		await flush();
		expect(cached).toEqual(['art://b']);
		orchestrator.dispose();
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
		subscribe: () => () => {},
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
		cacheAlbumArt?: (imageUrl: string) => Promise<void>;
		getAccessToken?: () => string;
		getAudioFileUrl?: (trackId: string) => string | null;
		getTrackCacheUrl?: (trackId: string) => string | null;
		getTransportToken?: () => unknown;
		isOfflinePlaybackMode?: () => boolean;
		onPlaybackTick?: () => void;
		prewarmArtwork?: (imageUrl: string) => void;
		refreshTrackCachedCount?: () => void;
		requestOverlayRerender?: () => void;
		resolveArtistLogoUrl?: (artistId: string) => Promise<string | null>;
		showPlaybackToast?: (message: string) => void;
		trackSourceNative?: TrackSourceNative;
	} = {},
): PlaybackOrchestrator {
	return new PlaybackOrchestrator({
		cacheAlbumArt: opts.cacheAlbumArt ?? (() => Promise.resolve()),
		getAccessToken: opts.getAccessToken ?? (() => ''),
		getAudioFileUrl: opts.getAudioFileUrl ?? (() => null),
		getTrackCacheUrl: opts.getTrackCacheUrl ?? (() => null),
		getTransportToken: opts.getTransportToken ?? (() => null),
		isOfflinePlaybackMode: opts.isOfflinePlaybackMode ?? (() => false),
		notification,
		onPlaybackTick: opts.onPlaybackTick ?? (() => {}),
		playbackStore: playbackStore as unknown as PlaybackStore,
		prewarmArtwork: opts.prewarmArtwork ?? (() => {}),
		refreshTrackCachedCount: opts.refreshTrackCachedCount ?? (() => {}),
		requestOverlayRerender: opts.requestOverlayRerender ?? (() => {}),
		requestRerender,
		resolveArtistLogoUrl: opts.resolveArtistLogoUrl ?? (() => Promise.resolve(null)),
		showPlaybackToast: opts.showPlaybackToast ?? (() => {}),
		trackSourceNative: opts.trackSourceNative ?? fakeTrackSourceNative(),
	});
}

function fakeTrackSourceNative(
	overrides: Partial<TrackSourceNative> = {},
): TrackSourceNative & { upcomingQueuePayloads: Array<string> } {
	const upcomingQueuePayloads: Array<string> = [];
	return {
		cacheTrackFromUrl: () => {},
		getCachedTrackFileUrl: () => '',
		setUpcomingQueue: (payload) => {
			upcomingQueuePayloads.push(payload);
		},
		upcomingQueuePayloads,
		...overrides,
	};
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

function fakePalette(): {
	service: PlaybackUserServices['paletteService'];
	queue: PlaybackUserServices['paletteQueue'];
	state: {
		warmedUp: Array<Array<string>>;
		hasPaletteFor: Set<string>;
		prioritized: Array<string>;
		enqueued: Array<string>;
	};
} {
	const state = {
		enqueued: [] as Array<string>,
		hasPaletteFor: new Set<string>(),
		prioritized: [] as Array<string>,
		warmedUp: [] as Array<Array<string>>,
	};
	return {
		queue: {
			enqueue: (imageUrl) => {
				if (imageUrl) state.enqueued.push(imageUrl);
			},
			prioritize: (imageUrl) => {
				if (imageUrl) state.prioritized.push(imageUrl);
			},
		},
		service: {
			hasPalette: (imageUrl) => imageUrl != null && state.hasPaletteFor.has(imageUrl),
			warmUp: (imageUrls) => {
				state.warmedUp.push(imageUrls);
				return Promise.resolve();
			},
		},
		state,
	};
}

function userServices(overrides: Partial<PlaybackUserServices> = {}): PlaybackUserServices {
	const palette = fakePalette();
	return {
		...fakeWaveformQueue().callbacks,
		paletteQueue: palette.queue,
		paletteService: palette.service,
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

function palettePlaybackStore(
	count: number,
	trackIndex = 0,
): { track: Track | null; trackIndex: number; tracks: Array<Track> } {
	const tracks = Array.from(
		{ length: count },
		(_, i) =>
			({ albumImageUrl: `art://${i}`, duration: 100, id: String(i), name: `Track ${i}` }) as Track,
	);
	return { track: tracks[trackIndex] ?? null, trackIndex, tracks };
}

function fakeScrobbleService(
	observed: Array<{ trackId: string | null; isPlaying: boolean; progressSeconds: number }> = [],
): ScrobbleService {
	return {
		getPendingScrobbles: () => [],
		observePlayback: (snapshot: {
			trackId: string | null;
			isPlaying: boolean;
			progressSeconds: number;
		}) => observed.push(snapshot),
		onAppReady: () => Promise.resolve(),
	} as unknown as ScrobbleService;
}

function trackingScrobbleService(pending = 0): {
	service: ScrobbleService;
	state: { appReadyCalls: number };
} {
	const state = { appReadyCalls: 0 };
	const service = {
		getPendingScrobbles: () => new Array(pending).fill({ trackId: 'x', triggeredAt: 0 }),
		observePlayback: () => {},
		onAppReady: () => {
			state.appReadyCalls += 1;
			return Promise.resolve();
		},
	} as unknown as ScrobbleService;
	return { service, state };
}

function subscribablePlaybackStore(overrides: Record<string, unknown> = {}): {
	store: { track: Track | null };
	notify: () => void;
} {
	const listeners = new Set<() => void>();
	const store = {
		album: null,
		isPlaying: true,
		loopMode: 'off',
		progressSeconds: 0,
		seekTarget: null,
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		track: makeTrack('a') as Track | null,
		trackIndex: 0,
		tracks: [makeTrack('a')] as Array<Track>,
		...overrides,
	};
	const notify = (): void => {
		for (const listener of [...listeners]) {
			listener();
		}
	};
	return { notify, store };
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function createDeferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}
