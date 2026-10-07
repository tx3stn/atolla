import 'jasmine/src/jasmine';
import {
	NativeAudioPlayer,
	type NativeAudioPlayerViewModel,
} from 'atolla_app/src/ui/components/NativeAudioPlayer';
import {
	LoopModes,
	PlaybackStore,
	type PlayheadMove,
	PlayheadMoves,
} from 'atolla_player/src/stores/Playback';
import { type IComponentTestDriver, valdiIt } from 'valdi_test/test/JSXTestUtils';

function mockTrack(overrides: Record<string, unknown> = {}) {
	return { duration: 180, id: 'track-1', name: 'Track One', ...overrides };
}

function mockPlaybackStore(overrides: Record<string, unknown> = {}): PlaybackStore {
	return {
		advancePastTrackId: jasmine.createSpy('advancePastTrackId'),
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
	viewModel: Omit<NativeAudioPlayerViewModel, 'isPlaying'> & { isPlaying?: boolean },
): NativeAudioPlayer {
	const resolved: NativeAudioPlayerViewModel = {
		...viewModel,
		isPlaying: viewModel.isPlaying ?? viewModel.playbackStore.isPlaying,
	};
	return driver.renderComponent(NativeAudioPlayer, resolved, undefined);
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
		valdiIt('reads the native track and position when they diverge', async (driver) => {
			const store = mockPlaybackStore({ track: mockTrack({ id: 'track-1' }) });
			const component = mountPlayer(driver, {
				playbackSourceUrl: 'file://test.mp3',
				playbackStore: store,
			});

			const player = getInternal(component);
			player.readNativeCurrentTrackId = () => 'track-5';
			player.safeGetNativePositionMs = () => 12000;

			expect((player.readNativeTrack as () => unknown)()).toEqual({
				positionSeconds: 12,
				trackId: 'track-5',
			});
		});

		valdiIt('reads nothing when the engine is already on the store track', async (driver) => {
			const store = mockPlaybackStore({ track: mockTrack({ id: 'track-1' }) });
			const component = mountPlayer(driver, {
				playbackSourceUrl: 'file://test.mp3',
				playbackStore: store,
			});

			const player = getInternal(component);
			player.readNativeCurrentTrackId = () => 'track-1';

			expect((player.readNativeTrack as () => unknown)()).toBeNull();
		});

		valdiIt('snaps the store to the native track with the move it is given', async (driver) => {
			const store = mockPlaybackStore({ track: mockTrack({ id: 'track-1' }) });
			const component = mountPlayer(driver, {
				playbackSourceUrl: 'file://test.mp3',
				playbackStore: store,
			});

			const player = getInternal(component);
			(player.reconcileStoreToNativeTrack as (track: unknown, move: PlayheadMove) => void)(
				{ positionSeconds: 12, trackId: 'track-5' },
				PlayheadMoves.finished,
			);

			expect(
				(store as unknown as PlayerInternal).reconcileToNativeTrack as jasmine.Spy,
			).toHaveBeenCalledWith('track-5', 12, PlayheadMoves.finished);
			expect(player.lastConfiguredTrackId).toBe('track-5');
		});

		valdiIt('leaves the store alone when there is nothing to catch up to', async (driver) => {
			const store = mockPlaybackStore({ track: mockTrack({ id: 'track-1' }) });
			const component = mountPlayer(driver, {
				playbackSourceUrl: 'file://test.mp3',
				playbackStore: store,
			});

			const player = getInternal(component);
			(player.reconcileStoreToNativeTrack as (track: unknown, move: PlayheadMove) => void)(
				null,
				PlayheadMoves.jumped,
			);

			expect(
				(store as unknown as PlayerInternal).reconcileToNativeTrack as jasmine.Spy,
			).not.toHaveBeenCalled();
		});
	});

	describe('syncProgressAndEvents() wake reconciliation', () => {
		valdiIt(
			'reads the engine, then takes its events, then reconciles, then applies them',
			async (driver) => {
				const store = mockPlaybackStore();
				const component = mountPlayer(driver, {
					playbackSourceUrl: 'file://test.mp3',
					playbackStore: store,
				});

				const player = getInternal(component);
				const calls: Array<string> = [];
				player.readNativeTrack = () => {
					calls.push('read');
					return null;
				};
				player.consumeNativeEvents = () => {
					calls.push('consume');
					return [];
				};
				player.reconcileStoreToNativeTrack = () => {
					calls.push('reconcile');
				};
				player.applyNativePlaybackEvents = () => {
					calls.push('apply');
					return false;
				};
				player.nativeIsActive = () => false;
				player.applyNativePosition = () => {};
				player.checkForStall = () => {};

				(player.syncProgressAndEvents as () => void)();

				expect(calls).toEqual(['read', 'consume', 'reconcile', 'apply']);
			},
		);
	});

	describe('syncProgressAndEvents() records how the engine moved', () => {
		const queue = [
			mockTrack({ id: 'track-1' }),
			mockTrack({ id: 'track-2' }),
			mockTrack({ id: 'track-3' }),
		];

		interface Engine {
			events: Array<string>;
			positionMs: number;
			trackId: string;
		}

		function playingStore(): PlaybackStore {
			const store = new PlaybackStore();
			store.playTracks(queue, 0);
			return store;
		}

		function syncWithEngine(
			driver: IComponentTestDriver,
			store: PlaybackStore,
			engine: Engine,
		): void {
			const component = mountPlayer(driver, {
				playbackSourceUrl: 'file://test.mp3',
				playbackStore: store,
			});
			const player = getInternal(component);
			const events = [...engine.events];
			player.readNativeCurrentTrackId = () => engine.trackId;
			player.safeGetNativePositionMs = () => engine.positionMs;
			player.nativeConsumeEvent = () => events.shift() ?? '';
			player.nativeIsActive = () => true;
			player.applyNativePosition = () => {};
			player.checkForStall = () => {};

			(player.syncProgressAndEvents as () => void)();
		}

		valdiIt('a natural end is finished, at the engine position', async (driver) => {
			const store = playingStore();

			syncWithEngine(driver, store, {
				events: ['completed:track-1'],
				positionMs: 400,
				trackId: 'track-2',
			});

			expect(store.track?.id).toBe('track-2');
			expect(store.progressSeconds).toBe(0.4);
			expect(store.playheadMove).toBe(PlayheadMoves.finished);
		});

		valdiIt('a skip from the lock screen is jumped', async (driver) => {
			const store = playingStore();

			syncWithEngine(driver, store, {
				events: ['jumped:track-2'],
				positionMs: 100,
				trackId: 'track-2',
			});

			expect(store.track?.id).toBe('track-2');
			expect(store.playheadMove).toBe(PlayheadMoves.jumped);
		});

		valdiIt('a natural end followed by a skip is jumped', async (driver) => {
			const store = playingStore();

			syncWithEngine(driver, store, {
				events: ['completed:track-1', 'jumped:track-3'],
				positionMs: 100,
				trackId: 'track-3',
			});

			expect(store.track?.id).toBe('track-3');
			expect(store.playheadMove).toBe(PlayheadMoves.jumped);
		});

		valdiIt('stepping past a failed track is jumped', async (driver) => {
			const store = playingStore();

			syncWithEngine(driver, store, {
				events: ['error:network:track-1:timed out'],
				positionMs: 0,
				trackId: 'track-1',
			});

			expect(store.track?.id).toBe('track-2');
			expect(store.playheadMove).toBe(PlayheadMoves.jumped);
		});

		valdiIt('an engine that moved with no events left to say why is jumped', async (driver) => {
			const store = playingStore();

			syncWithEngine(driver, store, { events: [], positionMs: 400, trackId: 'track-2' });

			expect(store.track?.id).toBe('track-2');
			expect(store.playheadMove).toBe(PlayheadMoves.jumped);
		});

		valdiIt(
			'a completion seen before the engine reports its new track is finished',
			async (driver) => {
				const store = playingStore();

				syncWithEngine(driver, store, {
					events: ['completed:track-1'],
					positionMs: 179000,
					trackId: 'track-1',
				});

				expect(store.track?.id).toBe('track-2');
				expect(store.playheadMove).toBe(PlayheadMoves.finished);
			},
		);

		valdiIt('a repeated track coming round again is finished', async (driver) => {
			const store = playingStore();
			store.setLoopMode(LoopModes.track);
			const before = store.playheadRevision;

			syncWithEngine(driver, store, {
				events: ['completed:track-1'],
				positionMs: 300,
				trackId: 'track-1',
			});

			expect(store.track?.id).toBe('track-1');
			expect(store.playheadRevision).toBe(before + 1);
			expect(store.playheadMove).toBe(PlayheadMoves.finished);
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

	// after a force-close the engine is dead and the restore comes back paused, so the first bind is
	// deferred. isPlaying has to be a real prop for the play tap to bring us back here. valdi only
	// calls onViewModelUpdate when a property changes by identity, and playbackStore never does.
	describe('deferred first bind after a cold restore', () => {
		function mountColdRestore(driver: IComponentTestDriver): {
			configureSpy: jasmine.Spy;
			player: PlayerInternal;
			seekSpy: jasmine.Spy;
		} {
			const store = mockPlaybackStore({
				allowBackwardRebuild: true,
				isPlaying: false,
				progressSeconds: 90,
			});
			const component = mountPlayer(driver, {
				isPlaying: false,
				playbackSourceUrl: 'file://test.mp3',
				playbackStore: store,
			});
			const player = getInternal(component);
			const configureSpy = jasmine.createSpy('nativeConfigure');
			const seekSpy = jasmine.createSpy('safeSeekTo');
			player.nativeConfigure = configureSpy;
			player.safeSeekTo = seekSpy;
			player.nativeIsActive = () => false;
			return { configureSpy, player, seekSpy };
		}

		function tapPlay(player: PlayerInternal): void {
			const component = player as unknown as { viewModel: NativeAudioPlayerViewModel };
			component.viewModel = { ...component.viewModel, isPlaying: true };
			(player.onViewModelUpdate as () => void)();
		}

		valdiIt('does not configure while the restore is still paused', async (driver) => {
			const { configureSpy, player } = mountColdRestore(driver);

			(player.onViewModelUpdate as () => void)();

			expect(configureSpy).not.toHaveBeenCalled();
			expect(player.hasEverBoundSource).toBe(false);
		});

		valdiIt('configures once when the play tap flips the isPlaying prop', async (driver) => {
			const { configureSpy, player } = mountColdRestore(driver);
			(player.onViewModelUpdate as () => void)();

			tapPlay(player);

			expect(configureSpy).toHaveBeenCalledTimes(1);
			expect(player.hasEverBoundSource).toBe(true);
		});

		valdiIt('seeks to the restored offset on that first bind', async (driver) => {
			const { player, seekSpy } = mountColdRestore(driver);
			(player.onViewModelUpdate as () => void)();

			tapPlay(player);

			expect(seekSpy).toHaveBeenCalledWith(90000);
		});

		// remounting while the engine is still playing in the background is the case the reattach
		// skip exists for: it is already positioned, so seeking would re-buffer it
		valdiIt('does not seek when re-attaching to a live engine', async (driver) => {
			const store = mockPlaybackStore({
				allowBackwardRebuild: true,
				isPlaying: true,
				progressSeconds: 90,
			});
			const component = mountPlayer(driver, {
				isPlaying: true,
				playbackSourceUrl: 'file://test.mp3',
				playbackStore: store,
			});
			const player = getInternal(component);
			const seekSpy = jasmine.createSpy('safeSeekTo');
			player.safeSeekTo = seekSpy;
			player.nativeIsActive = () => true;
			player.hasEverBoundSource = false;
			player.lastSourceUrl = '';

			(player.onViewModelUpdate as () => void)();

			expect(seekSpy).not.toHaveBeenCalled();
		});
	});

	describe('applyInitialSeekForSource()', () => {
		// a gapless auto-advance snaps the store to the engine's own tiny start position via
		// reconcileToNativeTrack (allowBackwardRebuild=false, progressSeconds>0). seeking then
		// re-buffers an already-correctly-playing track — the audible restart. it must not fire.
		valdiIt('does not re-seek when following the engine (gapless advance)', async (driver) => {
			const store = mockPlaybackStore({ allowBackwardRebuild: false, progressSeconds: 0.05 });
			const component = mountPlayer(driver, {
				playbackSourceUrl: 'file://test.mp3',
				playbackStore: store,
			});

			const player = getInternal(component);
			const seekSpy = jasmine.createSpy('safeSeekTo');
			player.safeSeekTo = seekSpy;

			(player.applyInitialSeekForSource as () => void)();

			expect(seekSpy).not.toHaveBeenCalled();
		});

		valdiIt('seeks to the restored offset for a deliberate (non-engine) bind', async (driver) => {
			const store = mockPlaybackStore({ allowBackwardRebuild: true, progressSeconds: 45 });
			const component = mountPlayer(driver, {
				playbackSourceUrl: 'file://test.mp3',
				playbackStore: store,
			});

			const player = getInternal(component);
			const seekSpy = jasmine.createSpy('safeSeekTo');
			player.safeSeekTo = seekSpy;

			(player.applyInitialSeekForSource as () => void)();

			expect(seekSpy).toHaveBeenCalledWith(45000);
		});

		// the explicit user-seek path is independent of applyInitialSeekForSource: it fires from the
		// onCreate store subscriber off seekTarget and must keep working after the gate above.
		valdiIt('an explicit user seek still fires through the seekTarget path', async (driver) => {
			let listener: (() => void) | undefined;
			const store = mockPlaybackStore({
				seekTarget: null,
				subscribe: (fn: () => void) => {
					listener = fn;
					return () => {};
				},
			});
			const component = mountPlayer(driver, {
				playbackSourceUrl: 'file://test.mp3',
				playbackStore: store,
			});

			const player = getInternal(component);
			const seekSpy = jasmine.createSpy('safeSeekTo');
			player.safeSeekTo = seekSpy;

			(store as unknown as PlayerInternal).seekTarget = 30;
			listener?.();

			expect(seekSpy).toHaveBeenCalledWith(30000);
		});
	});

	describe('applyNativePlaybackEvents() error events', () => {
		function drainEvents(
			driver: IComponentTestDriver,
			events: Array<string>,
			viewModel: Partial<NativeAudioPlayerViewModel> = {},
			store: PlaybackStore = mockPlaybackStore(),
		): void {
			const component = mountPlayer(driver, {
				playbackSourceUrl: 'file://test.mp3',
				playbackStore: store,
				...viewModel,
			});
			const player = getInternal(component);

			(player.applyNativePlaybackEvents as (events: Array<string>) => boolean)(events);
		}

		valdiIt('reports the parsed kind, track and message for an error event', async (driver) => {
			let reported: unknown = null;
			drainEvents(driver, ['error:unsupported:track-1:cannot decode wmav2'], {
				onPlaybackError: (error) => {
					reported = error;
				},
			});

			expect(reported).toEqual({
				kind: 'unsupported',
				message: 'cannot decode wmav2',
				trackId: 'track-1',
			});
		});

		valdiIt('steps past the failed track so playback does not stall', async (driver) => {
			const store = mockPlaybackStore();
			drainEvents(driver, ['error:unsupported:track-1:cannot decode wmav2'], {}, store);

			expect(
				(store as unknown as PlayerInternal).advancePastTrackId as jasmine.Spy,
			).toHaveBeenCalledWith('track-1', PlayheadMoves.jumped);
		});

		valdiIt('leaves a paused queue where it is', async (driver) => {
			const store = mockPlaybackStore({ isPlaying: false });
			drainEvents(driver, ['error:unsupported:track-1:cannot decode wmav2'], {}, store);

			expect(
				(store as unknown as PlayerInternal).advancePastTrackId as jasmine.Spy,
			).not.toHaveBeenCalled();
		});

		valdiIt('falls back to completing the track when no id is carried', async (driver) => {
			const store = mockPlaybackStore();
			let completionCount = 0;
			drainEvents(
				driver,
				['error:unknown::something broke'],
				{
					onTrackCompleted: () => {
						completionCount += 1;
					},
				},
				store,
			);

			expect(completionCount).toBe(1);
			expect(
				(store as unknown as PlayerInternal).advancePastTrackId as jasmine.Spy,
			).not.toHaveBeenCalled();
		});
	});
});
