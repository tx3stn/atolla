import 'jasmine/src/jasmine';
import type { PlaybackStore } from 'atolla/src/stores/Playback';
import {
	NativeAudioPlayer,
	type NativeAudioPlayerViewModel,
} from 'atolla/src/ui/components/NativeAudioPlayer';
import { type IComponentTestDriver, valdiIt } from 'valdi_test/test/JSXTestUtils';

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

// mounting NativeAudioPlayer starts a progress-poll setInterval in onCreate that's only
// cleared in onDestroy. the driver tears down each test's component tree at the end, which
// fires onDestroy and clears the timer; leaked timers keep the jasmine runtime alive and hang
// the bazel test target to its timeout.
function mountPlayer(
	driver: IComponentTestDriver,
	viewModel: NativeAudioPlayerViewModel,
): NativeAudioPlayer {
	return driver.renderComponent(NativeAudioPlayer, viewModel, undefined);
}

describe('NativeAudioPlayer', () => {
	describe('triggerTrackCompletion()', () => {
		valdiIt('calls onTrackCompleted when provided', async (driver) => {
			let completionCount = 0;
			const component = mountPlayer(driver, {
				onTrackCompleted: () => {
					completionCount += 1;
				},
				playbackSourceUrl: 'file://test.mp3',
				playbackStore: mockPlaybackStore(),
			});

			const player = getInternal(component);
			(player.triggerTrackCompletion as () => void)();

			expect(completionCount).toBe(1);
		});

		valdiIt(
			'calls updateProgress with track duration when onTrackCompleted is not provided',
			async (driver) => {
				const store = mockPlaybackStore();
				const component = mountPlayer(driver, {
					playbackSourceUrl: 'file://test.mp3',
					playbackStore: store,
				});

				const player = getInternal(component);
				(player.triggerTrackCompletion as () => void)();

				expect(
					(store as unknown as PlayerInternal).updateProgress as jasmine.Spy,
				).toHaveBeenCalledWith(mockTrack().duration);
			},
		);

		valdiIt('does not call updateProgress when track is null', async (driver) => {
			const store = mockPlaybackStore({ track: null });
			const component = mountPlayer(driver, {
				playbackSourceUrl: 'file://test.mp3',
				playbackStore: store,
			});

			const player = getInternal(component);
			(player.triggerTrackCompletion as () => void)();

			expect(
				(store as unknown as PlayerInternal).updateProgress as jasmine.Spy,
			).not.toHaveBeenCalled();
		});
	});

	describe('checkForStall()', () => {
		valdiIt(
			'triggers completion once stallDetectedAtMs exceeds timeout when near end',
			async (driver) => {
				let completionCount = 0;
				const store = mockPlaybackStore({ track: mockTrack({ duration: 180 }) });
				const component = mountPlayer(driver, {
					onTrackCompleted: () => {
						completionCount += 1;
					},
					playbackSourceUrl: 'file://test.mp3',
					playbackStore: store,
				});

				const player = getInternal(component);
				// position is 1 second from end (within STALL_DETECT_REMAINING_S = 1.5s)
				player.lastNativePositionSeconds = 179;
				// stall was detected 6 seconds ago (past STALL_TIMEOUT_MS = 5000ms)
				player.stallDetectedAtMs = Date.now() - 6000;

				(player.checkForStall as () => void)();

				expect(completionCount).toBe(1);
			},
		);

		valdiIt('starts stall timer when near end but not yet timed out', async (driver) => {
			let completionCount = 0;
			const store = mockPlaybackStore({ track: mockTrack({ duration: 180 }) });
			const component = mountPlayer(driver, {
				onTrackCompleted: () => {
					completionCount += 1;
				},
				playbackSourceUrl: 'file://test.mp3',
				playbackStore: store,
			});

			const player = getInternal(component);
			// near end, but stallDetectedAtMs is null (timer not started yet)
			player.lastNativePositionSeconds = 179;
			player.stallDetectedAtMs = null;

			(player.checkForStall as () => void)();

			// should have started the timer (stallDetectedAtMs is now set) but not fired yet
			expect(player.stallDetectedAtMs).not.toBeNull();
			expect(completionCount).toBe(0);
		});

		valdiIt('does not trigger completion when not near end of track', async (driver) => {
			let completionCount = 0;
			const store = mockPlaybackStore({ track: mockTrack({ duration: 180 }) });
			const component = mountPlayer(driver, {
				onTrackCompleted: () => {
					completionCount += 1;
				},
				playbackSourceUrl: 'file://test.mp3',
				playbackStore: store,
			});

			const player = getInternal(component);
			// position is well before end (more than 1.5s remaining)
			player.lastNativePositionSeconds = 100;
			player.stallDetectedAtMs = Date.now() - 6000;

			(player.checkForStall as () => void)();

			expect(completionCount).toBe(0);
			// stall timer should be cleared since we're not near end
			expect(player.stallDetectedAtMs).toBeNull();
		});

		valdiIt('does not trigger when not playing', async (driver) => {
			let completionCount = 0;
			const store = mockPlaybackStore({ isPlaying: false, track: mockTrack({ duration: 180 }) });
			const component = mountPlayer(driver, {
				onTrackCompleted: () => {
					completionCount += 1;
				},
				playbackSourceUrl: 'file://test.mp3',
				playbackStore: store,
			});

			const player = getInternal(component);
			player.lastNativePositionSeconds = 179;
			player.stallDetectedAtMs = Date.now() - 6000;

			(player.checkForStall as () => void)();

			expect(completionCount).toBe(0);
		});
	});

	describe('reconcileStoreToNativeTrack()', () => {
		valdiIt(
			'snaps the store to the native track and position when they diverge',
			async (driver) => {
				const store = mockPlaybackStore({ track: mockTrack({ id: 'track-1' }) });
				const component = mountPlayer(driver, {
					playbackSourceUrl: 'file://test.mp3',
					playbackStore: store,
				});

				const player = getInternal(component);
				player.readNativeCurrentTrackId = () => 'track-5';
				player.safeGetNativePositionMs = () => 12000;

				(player.reconcileStoreToNativeTrack as () => void)();

				expect(
					(store as unknown as PlayerInternal).reconcileToNativeTrack as jasmine.Spy,
				).toHaveBeenCalledWith('track-5', 12);
				expect(player.lastConfiguredTrackId).toBe('track-5');
			},
		);

		valdiIt('is a no-op when the engine is already on the store track', async (driver) => {
			const store = mockPlaybackStore({ track: mockTrack({ id: 'track-1' }) });
			const component = mountPlayer(driver, {
				playbackSourceUrl: 'file://test.mp3',
				playbackStore: store,
			});

			const player = getInternal(component);
			player.readNativeCurrentTrackId = () => 'track-1';

			(player.reconcileStoreToNativeTrack as () => void)();

			expect(
				(store as unknown as PlayerInternal).reconcileToNativeTrack as jasmine.Spy,
			).not.toHaveBeenCalled();
		});
	});

	describe('syncProgressAndEvents() wake reconciliation', () => {
		valdiIt('reconciles to the native track before draining buffered events', async (driver) => {
			const store = mockPlaybackStore();
			const component = mountPlayer(driver, {
				playbackSourceUrl: 'file://test.mp3',
				playbackStore: store,
			});

			const player = getInternal(component);
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
		function captureAllowBackwardRebuild(
			driver: IComponentTestDriver,
			allowBackwardRebuild: boolean,
		): boolean {
			const store = mockPlaybackStore({ allowBackwardRebuild });
			const component = mountPlayer(driver, {
				playbackSourceUrl: 'file://test.mp3',
				playbackStore: store,
			});
			const player = getInternal(component);
			let captured: Array<unknown> = [];
			player.nativeConfigure = (...args: Array<unknown>) => {
				captured = args;
			};
			(player.configurePlayback as (s: string, n: string | null) => void)('file://test.mp3', null);
			return captured[6] as boolean;
		}

		valdiIt('forwards true when the store change is a deliberate navigation', async (driver) => {
			expect(captureAllowBackwardRebuild(driver, true)).toBe(true);
		});

		valdiIt('forwards false when the store change follows the native engine', async (driver) => {
			expect(captureAllowBackwardRebuild(driver, false)).toBe(false);
		});
	});

	describe('applyNativePosition()', () => {
		valdiIt(
			'does not overwrite progress with a transient 0 before the first reported motion',
			async (driver) => {
				const store = mockPlaybackStore({
					progressSeconds: 45,
					track: mockTrack({ duration: 180 }),
				});
				const component = mountPlayer(driver, {
					playbackSourceUrl: 'file://test.mp3',
					playbackStore: store,
				});

				const player = getInternal(component);
				player.lastConfiguredTrackId = 'track-1';

				(player.applyNativePosition as (positionMs: number) => void)(0);

				expect(
					(store as unknown as PlayerInternal).updateProgress as jasmine.Spy,
				).not.toHaveBeenCalled();
			},
		);

		valdiIt('writes the clamped position once a non-zero position is reported', async (driver) => {
			const store = mockPlaybackStore({
				progressSeconds: 45,
				track: mockTrack({ duration: 180 }),
			});
			const component = mountPlayer(driver, {
				playbackSourceUrl: 'file://test.mp3',
				playbackStore: store,
			});

			const player = getInternal(component);
			player.lastConfiguredTrackId = 'track-1';

			(player.applyNativePosition as (positionMs: number) => void)(50000);

			expect(
				(store as unknown as PlayerInternal).updateProgress as jasmine.Spy,
			).toHaveBeenCalledWith(50);
			expect(player.hasReportedProgressForSource).toBe(true);
		});

		// the poll keeps running at 5Hz while paused, and a paused engine reports the same position
		// every tick. each write notifies the store, which renders and re-checks the native player,
		// so a track left paused churns indefinitely for a value nobody changed
		valdiIt('stops writing to the store while paused', async (driver) => {
			const store = mockPlaybackStore({
				isPlaying: false,
				progressSeconds: 50,
				track: mockTrack({ duration: 180 }),
			});
			const component = mountPlayer(driver, {
				playbackSourceUrl: 'file://test.mp3',
				playbackStore: store,
			});

			const player = getInternal(component);
			player.lastConfiguredTrackId = 'track-1';
			const pollAt = (positionMs: number) =>
				(player.applyNativePosition as (positionMs: number) => void).call(player, positionMs);
			const updateProgress = (store as unknown as PlayerInternal).updateProgress as jasmine.Spy;

			pollAt(50000);
			updateProgress.calls.reset();

			pollAt(50000);
			pollAt(50000);
			pollAt(50000);

			expect(updateProgress).not.toHaveBeenCalled();
		});

		valdiIt('writes again once playback moves the position on', async (driver) => {
			const store = mockPlaybackStore({
				progressSeconds: 50,
				track: mockTrack({ duration: 180 }),
			});
			const component = mountPlayer(driver, {
				playbackSourceUrl: 'file://test.mp3',
				playbackStore: store,
			});

			const player = getInternal(component);
			player.lastConfiguredTrackId = 'track-1';
			const pollAt = (positionMs: number) =>
				(player.applyNativePosition as (positionMs: number) => void).call(player, positionMs);
			const updateProgress = (store as unknown as PlayerInternal).updateProgress as jasmine.Spy;

			pollAt(50000);
			pollAt(50000);
			updateProgress.calls.reset();

			pollAt(50200);

			expect(updateProgress).toHaveBeenCalledWith(50.2);
		});

		valdiIt('does not write while the native player is on a different track', async (driver) => {
			const store = mockPlaybackStore({
				progressSeconds: 0,
				track: mockTrack({ duration: 180 }),
			});
			const component = mountPlayer(driver, {
				playbackSourceUrl: 'file://test.mp3',
				playbackStore: store,
			});

			const player = getInternal(component);
			// native player is still configured for a previous track
			player.lastConfiguredTrackId = 'previous-track';

			(player.applyNativePosition as (positionMs: number) => void)(50000);

			expect(
				(store as unknown as PlayerInternal).updateProgress as jasmine.Spy,
			).not.toHaveBeenCalled();
		});
	});
});
