import 'jasmine/src/jasmine';
import type { PlaybackStore } from 'atolla/src/stores/Playback';
import {
	NativeAudioPlayer,
	type NativeAudioPlayerViewModel,
} from 'atolla/src/ui/components/NativeAudioPlayer';
import { createComponent, valdiIt } from 'valdi_test/test/JSXTestUtils';

function mockTrack(overrides: Record<string, unknown> = {}) {
	return { duration: 180, id: 'track-1', name: 'Track One', ...overrides };
}

function mockPlaybackStore(overrides: Record<string, unknown> = {}): PlaybackStore {
	return {
		allowBackwardRebuild: true,
		isPlaying: true,
		progressSeconds: 0,
		reconcileToNativeTrack: jasmine.createSpy('reconcileToNativeTrack'),
		runBatched: (fn: () => void) => fn(),
		seekTarget: null,
		setPlaying: jasmine.createSpy('setPlaying'),
		subscribe: () => () => {},
		track: mockTrack(),
		trackIndex: 0,
		tracks: [mockTrack()],
		updateProgress: jasmine.createSpy('updateProgress'),
		...overrides,
	} as unknown as PlaybackStore;
}

type PlayerInternal = Record<string, unknown>;

function getInternal(component: NativeAudioPlayer): PlayerInternal {
	return component as unknown as PlayerInternal;
}

// Mounting NativeAudioPlayer starts a progress-poll setInterval in onCreate that is only
// cleared in onDestroy. Track every mounted instance and tear it down in afterEach —
// leaked timers keep the jasmine runtime alive and hang the bazel test target to its timeout.
const mountedPlayers: Array<{ destroy: () => void }> = [];

function mountPlayer(viewModel: NativeAudioPlayerViewModel) {
	const instrumented = createComponent(NativeAudioPlayer, viewModel);
	mountedPlayers.push(instrumented);
	return instrumented;
}

describe('NativeAudioPlayer', () => {
	afterEach(() => {
		while (mountedPlayers.length > 0) {
			mountedPlayers.pop()?.destroy();
		}
	});

	describe('triggerTrackCompletion()', () => {
		valdiIt('calls onTrackCompleted when provided', async () => {
			let completionCount = 0;
			const instrumented = mountPlayer({
				onTrackCompleted: () => {
					completionCount += 1;
				},
				playbackSourceUrl: 'file://test.mp3',
				playbackStore: mockPlaybackStore(),
			});

			const player = getInternal(instrumented.getComponent());
			(player.triggerTrackCompletion as () => void)();

			expect(completionCount).toBe(1);
		});

		valdiIt(
			'calls updateProgress with track duration when onTrackCompleted is not provided',
			async () => {
				const store = mockPlaybackStore();
				const instrumented = mountPlayer({
					playbackSourceUrl: 'file://test.mp3',
					playbackStore: store,
				});

				const player = getInternal(instrumented.getComponent());
				(player.triggerTrackCompletion as () => void)();

				expect(
					(store as unknown as PlayerInternal).updateProgress as jasmine.Spy,
				).toHaveBeenCalledWith(mockTrack().duration);
			},
		);

		valdiIt('does not call updateProgress when track is null', async () => {
			const store = mockPlaybackStore({ track: null });
			const instrumented = mountPlayer({
				playbackSourceUrl: 'file://test.mp3',
				playbackStore: store,
			});

			const player = getInternal(instrumented.getComponent());
			(player.triggerTrackCompletion as () => void)();

			expect(
				(store as unknown as PlayerInternal).updateProgress as jasmine.Spy,
			).not.toHaveBeenCalled();
		});
	});

	describe('checkForStall()', () => {
		valdiIt(
			'triggers completion once stallDetectedAtMs exceeds timeout when near end',
			async () => {
				let completionCount = 0;
				const store = mockPlaybackStore({ track: mockTrack({ duration: 180 }) });
				const instrumented = mountPlayer({
					onTrackCompleted: () => {
						completionCount += 1;
					},
					playbackSourceUrl: 'file://test.mp3',
					playbackStore: store,
				});

				const player = getInternal(instrumented.getComponent());
				// Position is 1 second from end (within STALL_DETECT_REMAINING_S = 1.5s)
				player.lastNativePositionSeconds = 179;
				// Stall was detected 6 seconds ago (past STALL_TIMEOUT_MS = 5000ms)
				player.stallDetectedAtMs = Date.now() - 6000;

				(player.checkForStall as () => void)();

				expect(completionCount).toBe(1);
			},
		);

		valdiIt('starts stall timer when near end but not yet timed out', async () => {
			let completionCount = 0;
			const store = mockPlaybackStore({ track: mockTrack({ duration: 180 }) });
			const instrumented = mountPlayer({
				onTrackCompleted: () => {
					completionCount += 1;
				},
				playbackSourceUrl: 'file://test.mp3',
				playbackStore: store,
			});

			const player = getInternal(instrumented.getComponent());
			// Near end, but stallDetectedAtMs is null (timer not started yet)
			player.lastNativePositionSeconds = 179;
			player.stallDetectedAtMs = null;

			(player.checkForStall as () => void)();

			// Should have started the timer (stallDetectedAtMs is now set) but not fired yet
			expect(player.stallDetectedAtMs).not.toBeNull();
			expect(completionCount).toBe(0);
		});

		valdiIt('does not trigger completion when not near end of track', async () => {
			let completionCount = 0;
			const store = mockPlaybackStore({ track: mockTrack({ duration: 180 }) });
			const instrumented = mountPlayer({
				onTrackCompleted: () => {
					completionCount += 1;
				},
				playbackSourceUrl: 'file://test.mp3',
				playbackStore: store,
			});

			const player = getInternal(instrumented.getComponent());
			// Position is well before end (more than 1.5s remaining)
			player.lastNativePositionSeconds = 100;
			player.stallDetectedAtMs = Date.now() - 6000;

			(player.checkForStall as () => void)();

			expect(completionCount).toBe(0);
			// Stall timer should be cleared since we're not near end
			expect(player.stallDetectedAtMs).toBeNull();
		});

		valdiIt('does not trigger when not playing', async () => {
			let completionCount = 0;
			const store = mockPlaybackStore({ isPlaying: false, track: mockTrack({ duration: 180 }) });
			const instrumented = mountPlayer({
				onTrackCompleted: () => {
					completionCount += 1;
				},
				playbackSourceUrl: 'file://test.mp3',
				playbackStore: store,
			});

			const player = getInternal(instrumented.getComponent());
			player.lastNativePositionSeconds = 179;
			player.stallDetectedAtMs = Date.now() - 6000;

			(player.checkForStall as () => void)();

			expect(completionCount).toBe(0);
		});
	});

	describe('reconcileStoreToNativeTrack()', () => {
		valdiIt('snaps the store to the native track and position when they diverge', async () => {
			const store = mockPlaybackStore({ track: mockTrack({ id: 'track-1' }) });
			const instrumented = mountPlayer({
				playbackSourceUrl: 'file://test.mp3',
				playbackStore: store,
			});

			const player = getInternal(instrumented.getComponent());
			player.readNativeCurrentTrackId = () => 'track-5';
			player.safeGetNativePositionMs = () => 12000;

			(player.reconcileStoreToNativeTrack as () => void)();

			expect(
				(store as unknown as PlayerInternal).reconcileToNativeTrack as jasmine.Spy,
			).toHaveBeenCalledWith('track-5', 12);
			expect(player.lastConfiguredTrackId).toBe('track-5');
		});

		valdiIt('is a no-op when the engine is already on the store track', async () => {
			const store = mockPlaybackStore({ track: mockTrack({ id: 'track-1' }) });
			const instrumented = mountPlayer({
				playbackSourceUrl: 'file://test.mp3',
				playbackStore: store,
			});

			const player = getInternal(instrumented.getComponent());
			player.readNativeCurrentTrackId = () => 'track-1';

			(player.reconcileStoreToNativeTrack as () => void)();

			expect(
				(store as unknown as PlayerInternal).reconcileToNativeTrack as jasmine.Spy,
			).not.toHaveBeenCalled();
		});
	});

	describe('syncProgressAndEvents() wake reconciliation', () => {
		valdiIt('reconciles to the native track before draining buffered events', async () => {
			const store = mockPlaybackStore();
			const instrumented = mountPlayer({
				playbackSourceUrl: 'file://test.mp3',
				playbackStore: store,
			});

			const player = getInternal(instrumented.getComponent());
			const calls: Array<string> = [];
			player.reconcileStoreToNativeTrack = () => {
				calls.push('reconcile');
			};
			player.drainNativePlaybackEvents = () => {
				calls.push('drain');
				return false;
			};
			player.nativeIsActive = () => false;
			player.applyNativePosition = () => {};
			player.checkForStall = () => {};

			(player.syncProgressAndEvents as () => void)();

			expect(calls.indexOf('reconcile')).toBe(0);
			expect(calls.indexOf('reconcile')).toBeLessThan(calls.indexOf('drain'));
		});
	});

	describe('configurePlayback() backward-rebuild intent', () => {
		function captureAllowBackwardRebuild(allowBackwardRebuild: boolean): boolean {
			const store = mockPlaybackStore({ allowBackwardRebuild });
			const instrumented = mountPlayer({
				playbackSourceUrl: 'file://test.mp3',
				playbackStore: store,
			});
			const player = getInternal(instrumented.getComponent());
			let captured: Array<unknown> = [];
			player.nativeConfigure = (...args: Array<unknown>) => {
				captured = args;
			};
			(player.configurePlayback as (s: string, n: string | null) => void)('file://test.mp3', null);
			return captured[6] as boolean;
		}

		valdiIt('forwards true when the store change is a deliberate navigation', async () => {
			expect(captureAllowBackwardRebuild(true)).toBe(true);
		});

		valdiIt('forwards false when the store change follows the native engine', async () => {
			expect(captureAllowBackwardRebuild(false)).toBe(false);
		});
	});

	describe('applyNativePosition()', () => {
		valdiIt(
			'does not overwrite progress with a transient 0 before the first reported motion',
			async () => {
				const store = mockPlaybackStore({
					progressSeconds: 45,
					track: mockTrack({ duration: 180 }),
				});
				const instrumented = mountPlayer({
					playbackSourceUrl: 'file://test.mp3',
					playbackStore: store,
				});

				const player = getInternal(instrumented.getComponent());
				player.lastConfiguredTrackId = 'track-1';

				(player.applyNativePosition as (positionMs: number) => void)(0);

				expect(
					(store as unknown as PlayerInternal).updateProgress as jasmine.Spy,
				).not.toHaveBeenCalled();
			},
		);

		valdiIt('writes the clamped position once a non-zero position is reported', async () => {
			const store = mockPlaybackStore({
				progressSeconds: 45,
				track: mockTrack({ duration: 180 }),
			});
			const instrumented = mountPlayer({
				playbackSourceUrl: 'file://test.mp3',
				playbackStore: store,
			});

			const player = getInternal(instrumented.getComponent());
			player.lastConfiguredTrackId = 'track-1';

			(player.applyNativePosition as (positionMs: number) => void)(50000);

			expect(
				(store as unknown as PlayerInternal).updateProgress as jasmine.Spy,
			).toHaveBeenCalledWith(50);
			expect(player.hasReportedProgressForSource).toBe(true);
		});

		valdiIt('does not write while the native player is on a different track', async () => {
			const store = mockPlaybackStore({
				progressSeconds: 0,
				track: mockTrack({ duration: 180 }),
			});
			const instrumented = mountPlayer({
				playbackSourceUrl: 'file://test.mp3',
				playbackStore: store,
			});

			const player = getInternal(instrumented.getComponent());
			// Native player is still configured for a previous track.
			player.lastConfiguredTrackId = 'previous-track';

			(player.applyNativePosition as (positionMs: number) => void)(50000);

			expect(
				(store as unknown as PlayerInternal).updateProgress as jasmine.Spy,
			).not.toHaveBeenCalled();
		});
	});
});
