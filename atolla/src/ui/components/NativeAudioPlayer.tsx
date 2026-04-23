// @ts-nocheck
import { StatefulComponent } from 'valdi_core/src/Component';
import {
	applyNativeAudioPlaybackEventAction,
	normalizeNativeAudioPlaybackEventAction,
} from '../../services/NativeAudioPlaybackEventSync';
import type { PlaybackStore } from '../../stores/Playback';
import {
	clearAtollaAudioPlayback,
	configureAtollaAudioPlayback,
	consumeAtollaAudioPlaybackEvent,
	getAtollaAudioPlaybackPositionMs,
	seekAtollaAudioPlaybackToMs,
	setAtollaAudioPlaybackRate,
	setAtollaAudioPlaybackVolume,
} from '../../TrackPlaybackNative';

const PROGRESS_POLL_INTERVAL_MS = 200;

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
				this.safeSetPlaybackRate(nextRate);
			}

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

		if (source !== this.lastSourceUrl || next !== this.lastNextSourceUrl) {
			const isReattach = !this.hasEverBoundSource;
			this.hasEverBoundSource = true;
			this.lastSourceUrl = source;
			this.lastNextSourceUrl = next;
			this.lastCompletedToken = '';
			this.hasReportedProgressForSource = false;
			this.configurePlayback(source, this.viewModel.nextPlaybackSourceUrl ?? null);
			// Skip the initial seek when re-attaching to an already-running player
			// (app remount while background playback was in progress) — ExoPlayer is
			// already at the right position and seeking would cause a re-buffer stutter.
			if (!isReattach) {
				this.applyInitialSeekForSource();
			}
			this.viewModel.onPlaybackEvent?.('source-bound');
		}

		this.safeSetVolume(this.viewModel.volume ?? 1);
	}

	onRender(): void {}

	private configurePlayback(sourceUrl: string, nextSourceUrl: string | null): void {
		const normalizedSource = this.normalizeLocalFileSource(sourceUrl);
		const normalizedNext = nextSourceUrl ? this.normalizeLocalFileSource(nextSourceUrl) : '';
		const currentTrackId = this.viewModel.playbackStore.track?.id ?? '';
		const nextTrackId = this.resolveNextTrackId() ?? '';
		const currentDurationMs = this.resolveCurrentTrackDurationMs() ?? 0;
		const nextDurationMs = this.resolveNextTrackDurationMs() ?? 0;

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
		try {
			const positionMs = getAtollaAudioPlaybackPositionMs();
			if (Number.isFinite(positionMs) && positionMs >= 0 && this.viewModel.isActive !== false) {
				if (positionMs > 0 && !this.hasReportedProgressForSource) {
					this.hasReportedProgressForSource = true;
					this.viewModel.onPlaybackEvent?.('progress');
				}
				const trackDurationSeconds = this.viewModel.playbackStore.track?.duration ?? 0;
				const positionSeconds = positionMs / 1000;
				const safePositionSeconds =
					trackDurationSeconds > 0
						? Math.min(positionSeconds, Math.max(0, trackDurationSeconds - 0.05))
						: positionSeconds;
				this.viewModel.playbackStore.updateProgress(safePositionSeconds);
			}
		} catch {
			// best effort poll
		}

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

			if (event === 'completed') {
				const activeTrackId = this.viewModel.playbackStore.track?.id ?? '';
				const activeSourceUrl = this.viewModel.playbackSourceUrl ?? '';
				const completionToken = `${activeTrackId}|${activeSourceUrl}`;
				if (completionToken !== this.lastCompletedToken) {
					this.lastCompletedToken = completionToken;
					if (this.viewModel.onTrackCompleted) {
						this.viewModel.onTrackCompleted();
					} else {
						const track = this.viewModel.playbackStore.track;
						if (track) {
							this.viewModel.playbackStore.updateProgress(track.duration);
						}
					}
					this.viewModel.onPlaybackEvent?.('completed');
				}
				continue;
			}

			if (event === 'loaded') {
				this.viewModel.onPlaybackEvent?.('loaded');
				continue;
			}

			if (event.startsWith('error:')) {
				this.viewModel.onPlaybackEvent?.('error');
				this.viewModel.onPlaybackError?.(`native audio error: ${event.slice('error:'.length)}`);
				continue;
			}

			const nativeAction = normalizeNativeAudioPlaybackEventAction(event);
			if (nativeAction !== '') {
				applyNativeAudioPlaybackEventAction(this.viewModel.playbackStore, nativeAction);
				this.viewModel.onPlaybackEvent?.('pause-requested');
			}
		}
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
