// @ts-nocheck
import { makeAssetFromUrl } from 'valdi_core/src/Asset';
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { PlaybackStore } from '../../stores/Playback';

export interface VideoAudioPlayerViewModel {
	onPlaybackError?: (error: string) => void;
	onPlaybackEvent?: (event: string) => void;
	playbackSourceUrl: string;
	playbackStore: PlaybackStore;
}

interface VideoAudioPlayerState {
	seekToTimeMs?: number;
}

export class VideoAudioPlayer extends StatefulComponent<
	VideoAudioPlayerViewModel,
	VideoAudioPlayerState
> {
	state: VideoAudioPlayerState = {};

	private loadTimeout: ReturnType<typeof setTimeout> | null = null;
	private lastSourceUrl = '';
	private lastSeekTarget: number | null = null;
	private hasReportedLoadedForSource = false;
	private hasReportedProgressForSource = false;
	private resolvedSourceAsset: unknown = null;
	private resolvedSourceString = '';

	onDestroy(): void {
		this.clearLoadTimeout();
	}

	onViewModelUpdate(): void {
		const { playbackSourceUrl, playbackStore } = this.viewModel;

		if (!playbackSourceUrl || !playbackStore.track) {
			this.lastSourceUrl = '';
			this.lastSeekTarget = null;
			this.hasReportedLoadedForSource = false;
			this.hasReportedProgressForSource = false;
			this.resolvedSourceAsset = null;
			this.resolvedSourceString = '';
			this.clearLoadTimeout();
			if (this.state.seekToTimeMs != null) {
				this.setState({ seekToTimeMs: undefined });
			}
			return;
		}

		if (playbackSourceUrl !== this.lastSourceUrl) {
			this.lastSourceUrl = playbackSourceUrl;
			this.lastSeekTarget = null;
			this.hasReportedLoadedForSource = false;
			this.hasReportedProgressForSource = false;
			this.resolveVideoSource(playbackSourceUrl);
			this.clearLoadTimeout();
			this.viewModel.onPlaybackEvent?.('source-bound');
			this.startLoadTimeout(this.describeResolvedSource());
		}

		const seekTarget = playbackStore.seekTarget;
		if (seekTarget != null && seekTarget !== this.lastSeekTarget) {
			this.lastSeekTarget = seekTarget;
			this.setState({ seekToTimeMs: seekTarget * 1000 });
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
			playbackRate={playbackStore.isPlaying ? 1 : 0}
			seekToTime={this.state.seekToTimeMs}
			src={source}
			style={styles.hiddenAudioVideo}
			volume={1}
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
		const track = this.viewModel.playbackStore.track;
		if (track) {
			this.viewModel.playbackStore.updateProgress(track.duration);
		}
		this.viewModel.onPlaybackEvent?.('completed');
	};

	private handleProgressUpdated = (timeMs: number): void => {
		if (timeMs > 0 && !this.hasReportedProgressForSource) {
			this.hasReportedProgressForSource = true;
			this.clearLoadTimeout();
			this.viewModel.onPlaybackEvent?.('progress');
		}

		if (timeMs >= 0) {
			this.viewModel.playbackStore.updateProgress(timeMs / 1000);
		}

		if (this.state.seekToTimeMs != null) {
			this.setState({ seekToTimeMs: undefined });
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
