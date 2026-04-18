// @ts-nocheck
import { makeAssetFromUrl } from 'valdi_core/src/Asset';
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { PlaybackStore } from '../../stores/Playback';

const PRE_ROLL_THRESHOLD_MS = 1500;

export interface VideoAudioPlayerViewModel {
	isActive?: boolean;
	isPreRolling?: boolean;
	onNearingEnd?: () => void;
	onPlaybackError?: (error: string) => void;
	onPlaybackEvent?: (event: string) => void;
	onTrackCompleted?: () => void;
	playbackSourceUrl: string | null;
	playbackStore: PlaybackStore;
	volume?: number;
}

interface VideoAudioPlayerState {
	playbackRate: number;
	seekToTimeMs?: number;
}

export class VideoAudioPlayer extends StatefulComponent<
	VideoAudioPlayerViewModel,
	VideoAudioPlayerState
> {
	state: VideoAudioPlayerState = {
		playbackRate: 0,
		seekToTimeMs: 0,
	};

	private unsubscribePlaybackStore?: () => void;

	private loadTimeout: ReturnType<typeof setTimeout> | null = null;
	private lastSourceUrl = '';
	private hasReportedLoadedForSource = false;
	private hasReportedProgressForSource = false;
	private hasSignaledNearingEnd = false;
	private resolvedSourceAsset: unknown = null;
	private resolvedSourceString = '';

	onDestroy(): void {
		this.unsubscribePlaybackStore?.();
		this.clearLoadTimeout();
	}

	onCreate(): void {
		const isActive = this.viewModel.isActive !== false;
		const isPreRolling = this.viewModel.isPreRolling === true;
		this.setState({
			playbackRate: (isActive || isPreRolling) && this.viewModel.playbackStore.isPlaying ? 1 : 0,
		});

		this.unsubscribePlaybackStore = this.viewModel.playbackStore.subscribe(() => {
			const isActive = this.viewModel.isActive !== false;
			const isPreRolling = this.viewModel.isPreRolling === true;
			if (!isActive && !isPreRolling) {
				if (this.state.playbackRate !== 0) {
					this.setState({ playbackRate: 0 });
				}
				return;
			}

			const nextPlaybackRate = this.viewModel.playbackStore.isPlaying ? 1 : 0;

			if (!isActive) {
				// Pre-rolling: follow isPlaying but skip seek logic
				if (nextPlaybackRate !== this.state.playbackRate) {
					this.setState({ playbackRate: nextPlaybackRate });
				}
				return;
			}

			const seekTarget = this.viewModel.playbackStore.seekTarget;
			const shouldApplySeek = seekTarget != null;
			const nextSeekToTimeMs =
				seekTarget != null ? Math.max(0, seekTarget * 1000) : this.state.seekToTimeMs;

			if (
				nextPlaybackRate !== this.state.playbackRate ||
				shouldApplySeek ||
				nextSeekToTimeMs !== this.state.seekToTimeMs
			) {
				this.setState({ playbackRate: nextPlaybackRate, seekToTimeMs: nextSeekToTimeMs });
			}
		});
	}

	onViewModelUpdate(): void {
		const { playbackSourceUrl, playbackStore } = this.viewModel;

		if (!playbackSourceUrl || !playbackStore.track) {
			this.lastSourceUrl = '';
			this.hasReportedLoadedForSource = false;
			this.hasReportedProgressForSource = false;
			this.hasSignaledNearingEnd = false;
			this.resolvedSourceAsset = null;
			this.resolvedSourceString = '';
			this.clearLoadTimeout();
			if (this.state.playbackRate !== 0 || this.state.seekToTimeMs !== 0) {
				this.setState({ playbackRate: 0, seekToTimeMs: 0 });
			}
			return;
		}

		if (playbackSourceUrl !== this.lastSourceUrl) {
			this.lastSourceUrl = playbackSourceUrl;
			this.hasReportedLoadedForSource = false;
			this.hasReportedProgressForSource = false;
			this.hasSignaledNearingEnd = false;
			this.resolveVideoSource(playbackSourceUrl);
			if (this.state.seekToTimeMs !== 0) {
				this.setState({ seekToTimeMs: 0 });
			}
			this.clearLoadTimeout();
			this.viewModel.onPlaybackEvent?.('source-bound');
			this.startLoadTimeout(this.describeResolvedSource());
		}

		const isActive = this.viewModel.isActive !== false;
		const isPreRolling = this.viewModel.isPreRolling === true;
		const expectedPlaybackRate = (isActive || isPreRolling) && playbackStore.isPlaying ? 1 : 0;
		if (expectedPlaybackRate !== this.state.playbackRate) {
			this.setState({ playbackRate: expectedPlaybackRate });
		}
	}

	onRender(): void {
		const { playbackSourceUrl, playbackStore } = this.viewModel;
		if (!playbackSourceUrl || !playbackStore.track) {
			return;
		}

		const source = this.resolvedSourceAsset ?? this.resolvedSourceString;

		// biome-ignore lint/a11y/useMediaCaption: audio-only playback via hidden video host
		<video
			onBeginPlaying={this.handleBeginPlaying}
			onCompleted={this.handleCompleted}
			onError={this.handleError}
			onProgressUpdated={this.handleProgressUpdated}
			onVideoLoaded={this.handleVideoLoaded}
			playbackRate={this.state.playbackRate}
			seekToTime={this.state.seekToTimeMs}
			src={source}
			style={styles.hiddenAudioVideo}
			volume={this.viewModel.volume ?? 1}
		/>;
	}

	private handleVideoLoaded = (durationMs?: number): void => {
		if (this.hasReportedLoadedForSource) {
			return;
		}

		this.hasReportedLoadedForSource = true;
		this.clearLoadTimeout();
		this.viewModel.onPlaybackEvent?.('loaded');
		if (typeof durationMs === 'number' && Number.isFinite(durationMs) && durationMs <= 0) {
			this.viewModel.onPlaybackError?.('video loaded but reported invalid duration');
		}
	};

	private handleBeginPlaying = (): void => {
		this.clearLoadTimeout();
		this.viewModel.onPlaybackEvent?.('playing');
	};

	private handleError = (error: string): void => {
		this.clearLoadTimeout();
		this.viewModel.onPlaybackEvent?.('error');
		const source = this.describeResolvedSource();
		const message = error || 'video playback error';
		this.viewModel.onPlaybackError?.(`video error: ${message} (${source})`);
	};

	private handleCompleted = (): void => {
		this.clearLoadTimeout();
		if (this.viewModel.onTrackCompleted) {
			this.viewModel.onTrackCompleted();
		} else {
			const track = this.viewModel.playbackStore.track;
			if (track) {
				this.viewModel.playbackStore.updateProgress(track.duration);
			}
		}
		this.viewModel.onPlaybackEvent?.('completed');
	};

	private handleProgressUpdated = (timeMs: number): void => {
		if (timeMs > 0 && !this.hasReportedProgressForSource) {
			this.hasReportedProgressForSource = true;
			this.clearLoadTimeout();
			this.viewModel.onPlaybackEvent?.('progress');
		}

		if (this.viewModel.isActive !== false) {
			if (timeMs >= 0) {
				this.viewModel.playbackStore.updateProgress(timeMs / 1000);
			}

			if (!this.hasSignaledNearingEnd && this.viewModel.onNearingEnd) {
				const track = this.viewModel.playbackStore.track;
				if (track) {
					const remainingMs = track.duration * 1000 - timeMs;
					if (remainingMs > 0 && remainingMs <= PRE_ROLL_THRESHOLD_MS) {
						this.hasSignaledNearingEnd = true;
						this.viewModel.onNearingEnd();
					}
				}
			}
		}
	};

	private startLoadTimeout(sourceLabel: string): void {
		this.clearLoadTimeout();
		this.loadTimeout = setTimeout(() => {
			if (this.hasReportedLoadedForSource || this.hasReportedProgressForSource) {
				return;
			}
			this.viewModel.onPlaybackError?.(`video load timeout (${sourceLabel})`);
		}, 2500);
	}

	private resolveVideoSource(sourceUrl: string): void {
		const normalized = this.normalizeLocalFileSource(sourceUrl);
		const loaderUrl = this.toTrackLoaderUrl(normalized);
		this.resolvedSourceString = loaderUrl;
		try {
			this.resolvedSourceAsset = makeAssetFromUrl(loaderUrl);
		} catch {
			this.resolvedSourceAsset = null;
		}
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

	private describeResolvedSource(): string {
		if (this.resolvedSourceAsset != null) {
			return `src=asset:${this.resolvedSourceString}`;
		}

		return `src=string:${this.resolvedSourceString}`;
	}

	private toTrackLoaderUrl(fileUrl: string): string {
		const encoded = encodeURIComponent(fileUrl);
		return `atolla-track://audio?u=${encoded}`;
	}

	private clearLoadTimeout(): void {
		if (this.loadTimeout != null) {
			clearTimeout(this.loadTimeout);
			this.loadTimeout = null;
		}
	}
}

const styles = {
	hiddenAudioVideo: new Style({
		height: 1,
		opacity: 0,
		position: 'absolute',
		width: 1,
	}),
};
