import { StatefulComponent } from 'valdi_core/src/Component';
import { DebugLogger } from '../../services/DebugLogger';
import {
	applyNativeAudioPlaybackEventAction,
	normalizeNativeAudioPlaybackEventAction,
	parseNativeAudioCompletedEvent,
	parseNativeAudioJumpedEvent,
} from '../../services/NativeAudioPlaybackEventSync';
import type { PlaybackStore } from '../../stores/Playback';
import {
	clearAtollaAudioPlayback,
	configureAtollaAudioPlayback,
	consumeAtollaAudioPlaybackEvent,
	getAtollaAudioPlaybackIsActive,
	getAtollaAudioPlaybackPositionMs,
	seekAtollaAudioPlaybackToMs,
	setAtollaAudioPlaybackNextNotification,
	setAtollaAudioPlaybackRate,
	setAtollaAudioPlaybackVolume,
} from '../../TrackPlaybackNative';

const PROGRESS_POLL_INTERVAL_MS = 200;
const STALL_DETECT_REMAINING_S = 1.5;
const STALL_TIMEOUT_MS = 5000;

export interface NativeAudioPlayerViewModel {
	isActive?: boolean;
	nextPlaybackSourceUrl?: string | null;
	onPlaybackError?: (error: string) => void;
	onPlaybackEvent?: (event: string) => void;
	onTrackCompleted?: () => void;
	playbackSourceUrl: string | null;
	playbackStore: PlaybackStore;
	volume?: number;
}

interface NativeAudioPlayerState {
	playbackRate: number;
}

export class NativeAudioPlayer extends StatefulComponent<
	NativeAudioPlayerViewModel,
	NativeAudioPlayerState
> {
	state: NativeAudioPlayerState = {
		playbackRate: 0,
	};

	private unsubscribePlaybackStore?: () => void;
	private progressInterval: ReturnType<typeof setInterval> | null = null;
	private lastSourceUrl = '';
	private lastNextSourceUrl = '';
	private lastCompletedToken = '';
	private lastSeekTargetSeconds: number | null = null;
	private hasReportedProgressForSource = false;
	private hasEverBoundSource = false;
	private lastConfiguredTrackId = '';
	private lastNativePositionSeconds = -1;
	private stallDetectedAtMs: number | null = null;

	onCreate(): void {
		const isActive = this.viewModel.isActive !== false;
		const playbackRate = isActive && this.viewModel.playbackStore.isPlaying ? 1 : 0;
		this.setState({ playbackRate });
		// Suppress rate=0 if the store hasn't restored yet (empty track + not playing)
		// to avoid pausing background playback before we know the intended state.
		// Once setQueueStore restores isPlaying correctly, playbackRate will be 1
		// if ExoPlayer is actively running and we'll send the right value.
		if (playbackRate > 0 || this.viewModel.playbackStore.track != null) {
			this.safeSetPlaybackRate(playbackRate);
		}
		this.safeSetVolume(this.viewModel.volume ?? 1);

		this.unsubscribePlaybackStore = this.viewModel.playbackStore.subscribe(() => {
			const nextRate =
				this.viewModel.isActive !== false && this.viewModel.playbackStore.isPlaying ? 1 : 0;
			if (nextRate !== this.state.playbackRate) {
				this.setState({ playbackRate: nextRate });
				if (this.isDestroyed()) return;
				this.safeSetPlaybackRate(nextRate);
			}

			if (this.isDestroyed()) return;
			const seekTarget = this.viewModel.playbackStore.seekTarget;
			if (seekTarget != null && seekTarget !== this.lastSeekTargetSeconds) {
				this.lastSeekTargetSeconds = seekTarget;
				this.safeSeekTo(Math.max(0, Math.floor(seekTarget * 1000)));
			}
		});

		this.progressInterval = setInterval(() => {
			this.syncProgressAndEvents();
		}, PROGRESS_POLL_INTERVAL_MS);
	}

	onDestroy(): void {
		this.unsubscribePlaybackStore?.();
		if (this.progressInterval != null) {
			clearInterval(this.progressInterval);
			this.progressInterval = null;
		}
	}

	onViewModelUpdate(): void {
		const source = this.viewModel.playbackSourceUrl;
		const next = this.viewModel.nextPlaybackSourceUrl ?? '';
		if (!source || !this.viewModel.playbackStore.track) {
			// Only clear if we have previously bound a source — that means the store IS
			// loaded and the track was explicitly stopped. Without this guard,
			// safeClearPlayback() fires on initial mount before the async store restore
			// completes, destroying background playback that is still running natively.
			if (!this.viewModel.playbackStore.track && this.hasEverBoundSource) {
				this.safeClearPlayback();
			}
			this.lastSourceUrl = '';
			this.lastNextSourceUrl = '';
			return;
		}

		if (source !== this.lastSourceUrl) {
			const isReattach = !this.hasEverBoundSource;
			// On cold restore with no active playback, skip configure so ExoPlayer isn't
			// loaded with a stale source. The next onViewModelUpdate after the user taps
			// play will still see source !== lastSourceUrl and configure normally.
			if (isReattach && !this.viewModel.playbackStore.isPlaying) {
				return;
			}
			this.hasEverBoundSource = true;
			DebugLogger.log('NativeAudioPlayer', 'source changed', {
				isPlaying: this.viewModel.playbackStore.isPlaying,
				isReattach,
				next: source,
				prev: this.lastSourceUrl || '(none)',
				trackId: this.viewModel.playbackStore.track?.id,
			});
			this.lastSourceUrl = source;
			this.lastNextSourceUrl = next;
			this.lastCompletedToken = '';
			this.hasReportedProgressForSource = false;
			this.lastNativePositionSeconds = -1;
			this.stallDetectedAtMs = null;
			this.configurePlayback(source, this.viewModel.nextPlaybackSourceUrl ?? null);
			// Apply rate directly from store state — onViewModelUpdate fires synchronously
			// during the parent's setState (before the PlaybackStore subscriber fires on
			// NativeAudioPlayer), so we cannot rely on the subscriber having set any
			// deferred rate field yet.
			const rate =
				this.viewModel.isActive !== false && this.viewModel.playbackStore.isPlaying ? 1 : 0;
			this.safeSetPlaybackRate(rate);
			// Skip the initial seek when re-attaching to an already-running player
			// (app remount while background playback was in progress) — ExoPlayer is
			// already at the right position and seeking would cause a re-buffer stutter.
			if (!isReattach) {
				this.applyInitialSeekForSource();
			}
			this.viewModel.onPlaybackEvent?.('source-bound');
		} else if (next !== this.lastNextSourceUrl) {
			// Only the gapless preload changed (e.g. playNext inserted a track) — update
			// the native player's next source without seeking the current track, which would
			// re-request the streaming URL and can cause a playback error.
			this.lastNextSourceUrl = next;
			this.configurePlayback(source, this.viewModel.nextPlaybackSourceUrl ?? null);
		}

		this.safeSetVolume(this.viewModel.volume ?? 1);
	}

	onRender(): void {}

	private configurePlayback(sourceUrl: string, nextSourceUrl: string | null): void {
		const normalizedSource = this.normalizeLocalFileSource(sourceUrl);
		const normalizedNext = nextSourceUrl ? this.normalizeLocalFileSource(nextSourceUrl) : '';
		const currentTrackId = this.viewModel.playbackStore.track?.id ?? '';
		this.lastConfiguredTrackId = currentTrackId;
		const nextTrackId = this.resolveNextTrackId() ?? '';
		const currentDurationMs = this.resolveCurrentTrackDurationMs() ?? 0;
		const nextDurationMs = this.resolveNextTrackDurationMs() ?? 0;

		DebugLogger.log('NativeAudioPlayer', 'configurePlayback', {
			currentDurationMs,
			currentTrackId,
			hasNext: !!normalizedNext,
			nextDurationMs,
			nextTrackId,
			rate: this.viewModel.isActive !== false && this.viewModel.playbackStore.isPlaying ? 1 : 0,
		});

		try {
			configureAtollaAudioPlayback(
				normalizedSource,
				currentTrackId,
				currentDurationMs,
				normalizedNext,
				nextTrackId,
				nextDurationMs,
			);
		} catch (error) {
			this.viewModel.onPlaybackError?.(
				`native audio configure failed: ${this.describeError(error)}`,
			);
		}

		try {
			const nextNotification = this.resolveNextTrackNotification();
			if (nextNotification) {
				setAtollaAudioPlaybackNextNotification(
					nextNotification.trackName,
					nextNotification.artistName,
					nextNotification.albumName,
					nextNotification.artworkUrl,
					nextNotification.durationSeconds,
					nextNotification.hasPrevious,
					nextNotification.hasNext,
				);
			}
		} catch {
			// best effort
		}
	}

	private resolveNextTrackNotification(): {
		trackName: string;
		artistName: string;
		albumName: string;
		artworkUrl: string;
		durationSeconds: number;
		hasPrevious: boolean;
		hasNext: boolean;
	} | null {
		const { playbackStore } = this.viewModel;
		const { loopMode, trackIndex, tracks } = playbackStore;
		if (tracks.length === 0) {
			return null;
		}

		let nextIndex: number | null = null;
		if (trackIndex < tracks.length - 1) {
			nextIndex = trackIndex + 1;
		} else if (loopMode === 'queue') {
			nextIndex = 0;
		}

		if (nextIndex == null) {
			return null;
		}

		const nextTrack = tracks[nextIndex];
		if (!nextTrack) {
			return null;
		}

		return {
			albumName: nextTrack.albumName ?? '',
			artistName: nextTrack.artistName ?? '',
			artworkUrl: nextTrack.albumImageUrl ?? '',
			durationSeconds: Number.isFinite(nextTrack.duration) ? nextTrack.duration : 0,
			hasNext: nextIndex < tracks.length - 1,
			hasPrevious: nextIndex > 0,
			trackName: nextTrack.name,
		};
	}

	private applyInitialSeekForSource(): void {
		const restoredProgressSeconds = this.viewModel.playbackStore.progressSeconds;
		if (!Number.isFinite(restoredProgressSeconds) || restoredProgressSeconds <= 0) {
			return;
		}

		this.lastSeekTargetSeconds = restoredProgressSeconds;
		this.safeSeekTo(Math.max(0, Math.floor(restoredProgressSeconds * 1000)));
	}

	private syncProgressAndEvents(): void {
		if (this.isDestroyed()) return;
		try {
			const positionMs = getAtollaAudioPlaybackPositionMs();
			if (Number.isFinite(positionMs) && positionMs >= 0 && this.viewModel.isActive !== false) {
				this.applyNativePosition(positionMs);
				if (this.isDestroyed()) return;
			}
		} catch {
			// best effort poll
		}

		if (this.isDestroyed()) return;

		this.checkForStall();

		if (this.isDestroyed()) return;
		// Drain all buffered native events under a single store notification. On app wake the
		// engine may have queued several background track transitions; advancing past each one
		// individually would notify subscribers (and reconfigure the native player) through
		// every intermediate track — audible as the player skipping through the tracks that
		// already played while backgrounded.
		let resumedFromBackground = false;
		this.viewModel.playbackStore.runBatched(() => {
			const nativeAdvanced = this.drainNativePlaybackEvents();
			// The engine auto-advanced while JS was frozen and is still playing, but the store
			// caught up via a heuristic that can land on isPlaying=false (e.g. a queue-end
			// branch). Follow the engine — it is the source of truth in the background — rather
			// than pushing a stale paused state back onto a track that is actively playing. The
			// nativeIsActive() gate keeps a genuine end-of-queue stop or a user pause untouched.
			if (nativeAdvanced && !this.viewModel.playbackStore.isPlaying && this.nativeIsActive()) {
				this.viewModel.playbackStore.setPlaying(true);
				resumedFromBackground = true;
			}
		});
		// Reassert the rate directly: the store subscriber only pushes when the computed rate
		// differs from state.playbackRate, which can be stale at 1 while the engine is paused.
		if (resumedFromBackground && !this.isDestroyed()) {
			this.safeSetPlaybackRate(1);
		}
	}

	private nativeIsActive(): boolean {
		try {
			return getAtollaAudioPlaybackIsActive() === true;
		} catch {
			return false;
		}
	}

	private drainNativePlaybackEvents(): boolean {
		let nativeAdvanced = false;
		while (true) {
			let event = '';
			try {
				event = consumeAtollaAudioPlaybackEvent();
			} catch {
				break;
			}

			if (!event) {
				break;
			}

			const jumpedTrackId = parseNativeAudioJumpedEvent(event);
			if (jumpedTrackId) {
				// Native moved to a different track outside the forward advance (previous
				// button stepping back through its history) — follow it. jumpToTrackId is
				// idempotent for duplicate/stale events.
				DebugLogger.log('NativeAudioPlayer', 'event:jumped', { trackId: jumpedTrackId });
				this.viewModel.playbackStore.jumpToTrackId(jumpedTrackId);
				nativeAdvanced = true;
				continue;
			}

			const completedEvent = parseNativeAudioCompletedEvent(event);
			if (completedEvent.isCompleted) {
				nativeAdvanced = true;
				if (completedEvent.finishedTrackId) {
					// Carries the finished track, so reconcile against it directly —
					// advancePastTrackId is idempotent for stale/duplicate completions,
					// and several buffered events (background transitions) land on the
					// correct track without step-counting.
					DebugLogger.log('NativeAudioPlayer', 'event:completed', {
						finishedTrackId: completedEvent.finishedTrackId,
					});
					this.viewModel.playbackStore.advancePastTrackId(completedEvent.finishedTrackId);
					this.viewModel.onPlaybackEvent?.('completed');
					continue;
				}

				const activeTrackId = this.viewModel.playbackStore.track?.id ?? '';
				const activeSourceUrl = this.viewModel.playbackSourceUrl ?? '';
				const completionToken = `${activeTrackId}|${activeSourceUrl}`;
				DebugLogger.log('NativeAudioPlayer', 'event:completed', {
					isDuplicate: completionToken === this.lastCompletedToken,
					trackId: activeTrackId,
				});
				if (completionToken !== this.lastCompletedToken) {
					this.lastCompletedToken = completionToken;
					this.triggerTrackCompletion();
					this.viewModel.onPlaybackEvent?.('completed');
				}
				continue;
			}

			if (event === 'loaded') {
				this.viewModel.onPlaybackEvent?.('loaded');
				continue;
			}

			if (event.startsWith('error:')) {
				DebugLogger.log('NativeAudioPlayer', 'event:error', {
					error: event.slice('error:'.length),
					trackId: this.viewModel.playbackStore.track?.id,
				});
				this.viewModel.onPlaybackEvent?.('error');
				this.viewModel.onPlaybackError?.(`native audio error: ${event.slice('error:'.length)}`);
				if (this.viewModel.playbackStore.isPlaying) {
					this.triggerTrackCompletion();
				}
				continue;
			}

			const nativeAction = normalizeNativeAudioPlaybackEventAction(event);
			if (nativeAction !== '') {
				DebugLogger.log('NativeAudioPlayer', `event:${nativeAction}-requested`, {
					trackId: this.viewModel.playbackStore.track?.id,
				});
				applyNativeAudioPlaybackEventAction(this.viewModel.playbackStore, nativeAction);
				this.viewModel.onPlaybackEvent?.(
					nativeAction === 'play' ? 'play-requested' : 'pause-requested',
				);
			}
		}
		return nativeAdvanced;
	}

	private applyNativePosition(positionMs: number): void {
		if (positionMs > 0 && !this.hasReportedProgressForSource) {
			this.hasReportedProgressForSource = true;
			this.viewModel.onPlaybackEvent?.('progress');
		}
		// Don't write a transient 0 before the engine has reported any forward motion for
		// this source. While ExoPlayer prepares/buffers/seeks a freshly bound source
		// getPositionMs() returns 0, which would flatten the intended starting progress
		// (0 on a fresh play, or the restored position on resume) until real playback
		// position arrives — causing the progress bar to flicker empty at track start.
		if (!this.hasReportedProgressForSource) {
			return;
		}
		// Guard: skip if the native player is still configured for a different
		// track (e.g. the 200ms tick fires between PlaybackStore.next() resetting
		// progressSeconds to 0 and the Valdi render that reconfigures the player).
		// Without this, the old track's position gets written into the new track's
		// progressSeconds and applyInitialSeekForSource seeks to the wrong position,
		// causing a native audio source error.
		if (this.viewModel.playbackStore.track?.id !== this.lastConfiguredTrackId) {
			return;
		}
		const trackDurationSeconds = this.viewModel.playbackStore.track?.duration ?? 0;
		const positionSeconds = positionMs / 1000;
		const safePositionSeconds =
			trackDurationSeconds > 0
				? Math.min(positionSeconds, Math.max(0, trackDurationSeconds - 0.05))
				: positionSeconds;
		this.lastNativePositionSeconds = safePositionSeconds;
		this.viewModel.playbackStore.updateProgress(safePositionSeconds);
	}

	private resolveNextTrackId(): string | null {
		const { playbackStore } = this.viewModel;
		const { loopMode, trackIndex, tracks } = playbackStore;
		if (tracks.length === 0) {
			return null;
		}

		if (trackIndex < tracks.length - 1) {
			return tracks[trackIndex + 1]?.id ?? null;
		}

		if (loopMode === 'queue') {
			return tracks[0]?.id ?? null;
		}

		return null;
	}

	private resolveCurrentTrackDurationMs(): number | null {
		const durationSeconds = this.viewModel.playbackStore.track?.duration;
		if (durationSeconds == null || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
			return null;
		}

		return Math.floor(durationSeconds * 1000);
	}

	private resolveNextTrackDurationMs(): number | null {
		const { playbackStore } = this.viewModel;
		const { loopMode, trackIndex, tracks } = playbackStore;
		if (tracks.length === 0) {
			return null;
		}

		let nextDurationSeconds: number | undefined;
		if (trackIndex < tracks.length - 1) {
			nextDurationSeconds = tracks[trackIndex + 1]?.duration;
		} else if (loopMode === 'queue') {
			nextDurationSeconds = tracks[0]?.duration;
		}

		if (
			nextDurationSeconds == null ||
			!Number.isFinite(nextDurationSeconds) ||
			nextDurationSeconds <= 0
		) {
			return null;
		}

		return Math.floor(nextDurationSeconds * 1000);
	}

	private normalizeLocalFileSource(sourceUrl: string): string {
		const trimmed = (sourceUrl ?? '').trim();
		if (!trimmed) {
			return trimmed;
		}

		if (trimmed.startsWith('file://')) {
			return trimmed;
		}

		if (trimmed.startsWith('/')) {
			return `file://${trimmed}`;
		}

		return trimmed;
	}

	private safeSetPlaybackRate(rate: number): void {
		try {
			setAtollaAudioPlaybackRate(rate);
		} catch (error) {
			this.viewModel.onPlaybackError?.(`native audio rate failed: ${this.describeError(error)}`);
		}
	}

	private safeSetVolume(volume: number): void {
		try {
			setAtollaAudioPlaybackVolume(Math.max(0, Math.min(1, volume)));
		} catch {
			// best effort
		}
	}

	private safeSeekTo(positionMs: number): void {
		try {
			seekAtollaAudioPlaybackToMs(positionMs);
		} catch {
			// best effort
		}
	}

	private safeClearPlayback(): void {
		try {
			clearAtollaAudioPlayback();
		} catch {
			// best effort
		}
	}

	private checkForStall(): void {
		if (!this.viewModel.playbackStore.isPlaying || this.lastNativePositionSeconds < 0) {
			return;
		}
		const stallTrack = this.viewModel.playbackStore.track;
		if (!stallTrack) {
			return;
		}
		const remaining = stallTrack.duration - this.lastNativePositionSeconds;
		if (remaining <= STALL_DETECT_REMAINING_S) {
			if (this.stallDetectedAtMs == null) {
				this.stallDetectedAtMs = Date.now();
			} else if (Date.now() - this.stallDetectedAtMs >= STALL_TIMEOUT_MS) {
				this.stallDetectedAtMs = null;
				this.triggerTrackCompletion();
			}
		} else {
			this.stallDetectedAtMs = null;
		}
	}

	private triggerTrackCompletion(): void {
		if (this.viewModel.onTrackCompleted) {
			this.viewModel.onTrackCompleted();
		} else {
			const track = this.viewModel.playbackStore.track;
			if (track) {
				this.viewModel.playbackStore.updateProgress(track.duration);
			}
		}
	}

	private describeError(error: unknown): string {
		if (typeof error === 'string') {
			return error;
		}

		if (error instanceof Error) {
			return error.message;
		}

		return 'unknown error';
	}
}
