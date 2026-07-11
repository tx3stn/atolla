import { StatefulComponent } from 'valdi_core/src/Component';
import { getLogger } from '../../services/Logger';
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
	getAtollaAudioPlaybackCurrentTrackId,
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
// how far a streamed track must play forward before it's safe to release deferred cache/prefetch
// downloads: "ready"/"playing" means the buffer is only just full enough to start, so a competing
// full-file download at that instant starves it and causes a brief pause at the start
// measuring played progress (not wall-clock) lets the stream build a cushion and holds off on stall
const PLAYBACK_BUFFER_CUSHION_MS = 3000;

const log = getLogger('NativeAudioPlayer');

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
	private hasReportedBufferedForSource = false;
	private hasEverBoundSource = false;
	private lastConfiguredTrackId = '';
	private lastNativePositionSeconds = -1;
	private playbackStartPositionMs = -1;
	private stallDetectedAtMs: number | null = null;

	onCreate(): void {
		const isActive = this.viewModel.isActive !== false;
		const playbackRate = isActive && this.viewModel.playbackStore.isPlaying ? 1 : 0;
		this.setState({ playbackRate });
		// suppress rate=0 before the store restores (empty track + not playing) to avoid pausing
		// background playback before we know the intended state; once isPlaying restores we send the
		// right value
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
			// only clear once we've bound a source before (store loaded, track explicitly stopped);
			// without this guard clear fires on cold mount before the async restore, destroying
			// background playback still running natively
			if (!this.viewModel.playbackStore.track && this.hasEverBoundSource) {
				this.safeClearPlayback();
			}
			this.lastSourceUrl = '';
			this.lastNextSourceUrl = '';
			return;
		}

		if (source !== this.lastSourceUrl) {
			const isReattach = !this.hasEverBoundSource;
			// on cold restore with no active playback, skip configure so ExoPlayer isn't loaded with a
			// stale source; the next onViewModelUpdate after the user taps play configures normally
			if (isReattach && !this.viewModel.playbackStore.isPlaying) {
				return;
			}
			this.hasEverBoundSource = true;
			log.debug('source changed', {
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
			this.hasReportedBufferedForSource = false;
			this.lastNativePositionSeconds = -1;
			this.playbackStartPositionMs = -1;
			this.stallDetectedAtMs = null;
			this.configurePlayback(source, this.viewModel.nextPlaybackSourceUrl ?? null);
			// apply rate from store state: onViewModelUpdate fires synchronously during the parent's
			// setState, before the PlaybackStore subscriber runs, so no deferred rate field is set yet
			const rate =
				this.viewModel.isActive !== false && this.viewModel.playbackStore.isPlaying ? 1 : 0;
			this.safeSetPlaybackRate(rate);
			// skip the initial seek when re-attaching to an already-running player (remount during
			// background playback): ExoPlayer is already positioned and seeking re-buffers (stutter)
			if (!isReattach) {
				this.applyInitialSeekForSource();
			}
			this.viewModel.onPlaybackEvent?.('source-bound');
		} else if (next !== this.lastNextSourceUrl) {
			// only the gapless preload changed (e.g. playNext inserted a track): update the next source
			// without seeking the current track, which would re-request the URL and can error
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

		log.debug('configurePlayback', {
			currentDurationMs,
			currentTrackId,
			hasNext: !!normalizedNext,
			nextDurationMs,
			nextTrackId,
			rate: this.viewModel.isActive !== false && this.viewModel.playbackStore.isPlaying ? 1 : 0,
		});

		try {
			this.nativeConfigure(
				normalizedSource,
				currentTrackId,
				currentDurationMs,
				normalizedNext,
				nextTrackId,
				nextDurationMs,
				this.viewModel.playbackStore.allowBackwardRebuild,
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

	// thin seam over the native bridge so tests can assert the args (notably allowBackwardRebuild)
	private nativeConfigure(
		sourceUrl: string,
		currentTrackId: string,
		currentDurationMs: number,
		nextSourceUrl: string,
		nextTrackId: string,
		nextDurationMs: number,
		allowBackwardRebuild: boolean,
	): void {
		configureAtollaAudioPlayback(
			sourceUrl,
			currentTrackId,
			currentDurationMs,
			nextSourceUrl,
			nextTrackId,
			nextDurationMs,
			allowBackwardRebuild,
		);
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
		// reconcile to the engine's track and drain buffered transitions before reading position.
		// On wake the store still points at the pre-background track; applying the engine's
		// new-track position to the stale track would advance the store to the wrong track and
		// push a stale source that rebuilds the native queue from 0 (audible as a restart)
		let resumedFromBackground = false;
		this.viewModel.playbackStore.runBatched(() => {
			this.reconcileStoreToNativeTrack();
			const nativeAdvanced = this.drainNativePlaybackEvents();
			// engine auto-advanced while JS was frozen and is still playing, but the store may
			// have caught up to isPlaying=false (e.g. a queue-end branch). follow the engine,
			// the background source of truth, rather than pushing a stale paused state onto a
			// playing track. the nativeIsActive() gate leaves a real end-of-queue stop or user
			// pause untouched
			if (nativeAdvanced && !this.viewModel.playbackStore.isPlaying && this.nativeIsActive()) {
				this.viewModel.playbackStore.setPlaying(true);
				resumedFromBackground = true;
			}
		});
		// reassert the rate directly: the store subscriber only pushes when the computed rate
		// differs from state.playbackRate, which can be stale at 1 while the engine is paused
		if (resumedFromBackground && !this.isDestroyed()) {
			this.safeSetPlaybackRate(1);
		}

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
	}

	// snaps the store to the engine's track/position when they diverge. reads the track id
	// directly rather than relying on the drained event queue, which drops its earliest entries
	// (cap 128) over a long screen-off session. aligns lastConfiguredTrackId so the same tick's
	// applyNativePosition guard accepts the engine position.
	private reconcileStoreToNativeTrack(): void {
		const nativeTrackId = this.readNativeCurrentTrackId();
		if (!nativeTrackId || nativeTrackId === (this.viewModel.playbackStore.track?.id ?? '')) {
			return;
		}
		const positionMs = this.safeGetNativePositionMs();
		const positionSeconds = Number.isFinite(positionMs) && positionMs >= 0 ? positionMs / 1000 : 0;
		this.viewModel.playbackStore.reconcileToNativeTrack(nativeTrackId, positionSeconds);
		this.lastConfiguredTrackId = nativeTrackId;
	}

	private readNativeCurrentTrackId(): string {
		try {
			return getAtollaAudioPlaybackCurrentTrackId() ?? '';
		} catch {
			return '';
		}
	}

	private safeGetNativePositionMs(): number {
		try {
			return getAtollaAudioPlaybackPositionMs();
		} catch {
			return -1;
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
				// native moved outside the forward advance (e.g. the previous button); follow
				// it. jumpToTrackId is idempotent for duplicate/stale events
				log.debug('event:jumped', { trackId: jumpedTrackId });
				this.viewModel.playbackStore.jumpToTrackId(jumpedTrackId);
				nativeAdvanced = true;
				continue;
			}

			const completedEvent = parseNativeAudioCompletedEvent(event);
			if (completedEvent.isCompleted) {
				nativeAdvanced = true;
				if (completedEvent.finishedTrackId) {
					// carries the finished track, so reconcile against it directly.
					// advancePastTrackId is idempotent for stale/duplicate completions, so
					// buffered background events land on the correct track without step-counting
					log.debug('event:completed', {
						finishedTrackId: completedEvent.finishedTrackId,
					});
					this.viewModel.playbackStore.advancePastTrackId(completedEvent.finishedTrackId);
					this.viewModel.onPlaybackEvent?.('completed');
					continue;
				}

				const activeTrackId = this.viewModel.playbackStore.track?.id ?? '';
				const activeSourceUrl = this.viewModel.playbackSourceUrl ?? '';
				const completionToken = `${activeTrackId}|${activeSourceUrl}`;
				log.debug('event:completed', {
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
				log.error('event:error', {
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
				log.debug(`event:${nativeAction}-requested`, {
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
		// don't write a transient 0 before the engine reports forward motion for this
		// source. while ExoPlayer prepares/buffers a freshly bound source getPositionMs()
		// returns 0, which would flatten the starting progress (0 fresh, or restored on
		// resume) until real position arrives and flicker the progress bar empty
		if (!this.hasReportedProgressForSource) {
			return;
		}
		// skip if the native player is still configured for a different
		// track (e.g. the 200ms tick fires between PlaybackStore.next() resetting
		// progressSeconds to 0 and the Valdi render that reconfigures the player).
		// without this, the old track's position gets written into the new track's
		// progressSeconds and applyInitialSeekForSource seeks to the wrong position,
		// causing a native audio source error
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
		// once the track has played a cushion forward from where it started (a fresh 0 or a
		// resumed offset), it's safe to release the deferred downloads: the stream has had time
		// to buffer ahead. measured against the first reported position so it tracks played
		// progress rather than absolute position, so resuming mid-track still waits for a cushion.
		const safePositionMs = safePositionSeconds * 1000;
		if (this.playbackStartPositionMs < 0) {
			this.playbackStartPositionMs = safePositionMs;
		}
		if (
			!this.hasReportedBufferedForSource &&
			safePositionMs - this.playbackStartPositionMs >= PLAYBACK_BUFFER_CUSHION_MS
		) {
			this.hasReportedBufferedForSource = true;
			this.viewModel.onPlaybackEvent?.('playback-cushion');
		}
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
