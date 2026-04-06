// @ts-nocheck
import { Component } from 'valdi_core/src/Component';
import {
	getAtollaNativeTrackPlayerDurationSeconds,
	getAtollaNativeTrackPlayerLastError,
	getAtollaNativeTrackPlayerPositionSeconds,
	getAtollaNativeTrackPlayerState,
	resetAtollaNativeTrackPlayer,
	seekAtollaNativeTrackPlayerTo,
	setAtollaNativeTrackPlayerPlaying,
	setAtollaNativeTrackPlayerSource,
} from '../../NativeTrackPlayer';
import type { PlaybackStore } from '../../stores/Playback';

export interface NativeAudioPlayerViewModel {
	onPlaybackError?: (error: string) => void;
	onPlaybackEvent?: (event: string) => void;
	playbackSourceUrl: string;
	playbackStore: PlaybackStore;
}

export class NativeAudioPlayer extends Component<NativeAudioPlayerViewModel> {
	private syncInterval: ReturnType<typeof setInterval> | null = null;
	private lastSourceUrl = '';
	private lastReportedError = '';
	private hasReportedLoadedForSource = false;
	private hasReportedProgressForSource = false;

	onCreate(): void {
		this.syncInterval = setInterval(() => {
			this.syncFromNativePlayer();
		}, 300);
	}

	onDestroy(): void {
		if (this.syncInterval != null) {
			clearInterval(this.syncInterval);
			this.syncInterval = null;
		}

		try {
			resetAtollaNativeTrackPlayer();
		} catch {
			// Native player may be unavailable on non-Android targets.
		}
	}

	onViewModelUpdate(): void {
		const { playbackSourceUrl, playbackStore } = this.viewModel;

		if (!playbackSourceUrl || !playbackStore.track) {
			try {
				setAtollaNativeTrackPlayerPlaying(false);
			} catch {
				// no-op
			}
			return;
		}

		if (playbackSourceUrl !== this.lastSourceUrl) {
			this.lastSourceUrl = playbackSourceUrl;
			this.lastReportedError = '';
			this.hasReportedLoadedForSource = false;
			this.hasReportedProgressForSource = false;

			try {
				setAtollaNativeTrackPlayerSource(playbackSourceUrl);
				this.viewModel.onPlaybackEvent?.('source-bound');
			} catch (error) {
				const message = error instanceof Error ? error.message : 'native source set failed';
				this.viewModel.onPlaybackError?.(message);
			}
		}

		try {
			setAtollaNativeTrackPlayerPlaying(playbackStore.isPlaying);
		} catch {
			// no-op
		}

		const seekTarget = playbackStore.seekTarget;
		if (seekTarget != null) {
			try {
				seekAtollaNativeTrackPlayerTo(seekTarget);
			} catch {
				// no-op
			}
		}
	}

	onRender(): void {}

	private syncFromNativePlayer(): void {
		const { playbackSourceUrl, playbackStore } = this.viewModel;
		if (!playbackSourceUrl || !playbackStore.track) {
			return;
		}

		try {
			const state = getAtollaNativeTrackPlayerState();
			const error = getAtollaNativeTrackPlayerLastError();

			if (error && error !== this.lastReportedError) {
				this.lastReportedError = error;
				this.viewModel.onPlaybackEvent?.('error');
				this.viewModel.onPlaybackError?.(error);
			}

			if (
				!this.hasReportedLoadedForSource &&
				(state === 'prepared' || state === 'playing' || state === 'paused')
			) {
				this.hasReportedLoadedForSource = true;
				this.viewModel.onPlaybackEvent?.('loaded');
			}

			const position = getAtollaNativeTrackPlayerPositionSeconds();
			const duration = getAtollaNativeTrackPlayerDurationSeconds();
			if (position > 0 && !this.hasReportedProgressForSource) {
				this.hasReportedProgressForSource = true;
				this.viewModel.onPlaybackEvent?.('progress');
			}

			if (position >= 0) {
				playbackStore.updateProgress(position);
			}

			if (state === 'completed' && duration > 0) {
				this.viewModel.onPlaybackEvent?.('completed');
				playbackStore.updateProgress(duration);
			}
		} catch {
			// Native player unavailable.
		}
	}
}
