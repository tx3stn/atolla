// @ts-nocheck
import { makeAssetFromUrl } from 'valdi_core/src/Asset';
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { PlaybackStore } from '../../stores/Playback';

const PRE_ROLL_THRESHOLD_MS = 1500;

export interface VideoAudioPlayerViewModel {
	isActive?: boolean;
	isPreRolling?: boolean;
	nextPlaybackSourceUrl?: string | null;
	onNearingEnd?: (remainingMs: number) => void;
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
	private lastNextSourceUrl = '';
	private resolvedSourceAsset: unknown = null;
	private resolvedSourceString = '';

	onDestroy(): void {
		this.unsubscribePlaybackStore?.();
		this.clearLoadTimeout();
	}

	onCreate(): void {
		const isActive = this.viewModel.isActive !== false;
		this.setState({
			playbackRate: isActive && this.viewModel.playbackStore.isPlaying ? 1 : 0,
		});

		this.unsubscribePlaybackStore = this.viewModel.playbackStore.subscribe(() => {
			const isActive = this.viewModel.isActive !== false;
			if (!isActive) {
				if (this.state.playbackRate !== 0) {
					this.setState({ playbackRate: 0 });
				}
				return;
			}

			const nextPlaybackRate = this.viewModel.playbackStore.isPlaying ? 1 : 0;

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
			this.lastNextSourceUrl = '';
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

		const normalizedNextSourceUrl = this.viewModel.nextPlaybackSourceUrl ?? '';
		if (
			playbackSourceUrl !== this.lastSourceUrl ||
			normalizedNextSourceUrl !== this.lastNextSourceUrl
		) {
			this.lastSourceUrl = playbackSourceUrl;
			this.lastNextSourceUrl = normalizedNextSourceUrl;
			this.hasReportedLoadedForSource = false;
			this.hasReportedProgressForSource = false;
			this.hasSignaledNearingEnd = false;
			this.resolveVideoSource(playbackSourceUrl, this.viewModel.nextPlaybackSourceUrl ?? null);
			const restoredProgressSeconds = this.viewModel.playbackStore.progressSeconds;
			const initialSeekToTimeMs =
				Number.isFinite(restoredProgressSeconds) && restoredProgressSeconds > 0
					? Math.max(0, Math.floor(restoredProgressSeconds * 1000))
					: 0;
			if (this.state.seekToTimeMs !== initialSeekToTimeMs) {
				this.setState({ seekToTimeMs: initialSeekToTimeMs });
			}
			this.clearLoadTimeout();
			this.viewModel.onPlaybackEvent?.('source-bound');
			this.startLoadTimeout(this.describeResolvedSource());
		}

		const isActive = this.viewModel.isActive !== false;
		const expectedPlaybackRate = isActive && playbackStore.isPlaying ? 1 : 0;
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
						this.viewModel.onNearingEnd(remainingMs);
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

	private resolveVideoSource(sourceUrl: string, nextSourceUrl: string | null): void {
		const normalized = this.normalizeLocalFileSource(sourceUrl);
		const normalizedNext = nextSourceUrl ? this.normalizeLocalFileSource(nextSourceUrl) : null;
		const currentTrackId = this.viewModel.playbackStore.track?.id ?? null;
		const nextTrackId = this.resolveNextTrackId();
		const currentTrackDurationMs = this.resolveCurrentTrackDurationMs();
		const nextTrackDurationMs = this.resolveNextTrackDurationMs();
		const loaderUrl = this.toTrackLoaderUrl(
			normalized,
			normalizedNext,
			currentTrackId,
			nextTrackId,
			currentTrackDurationMs,
			nextTrackDurationMs,
		);
		this.resolvedSourceString = loaderUrl;
		try {
			this.resolvedSourceAsset = makeAssetFromUrl(loaderUrl);
		} catch {
			this.resolvedSourceAsset = null;
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

		let nextTrackDurationSeconds: number | undefined;
		if (trackIndex < tracks.length - 1) {
			nextTrackDurationSeconds = tracks[trackIndex + 1]?.duration;
		} else if (loopMode === 'queue') {
			nextTrackDurationSeconds = tracks[0]?.duration;
		}

		if (
			nextTrackDurationSeconds == null ||
			!Number.isFinite(nextTrackDurationSeconds) ||
			nextTrackDurationSeconds <= 0
		) {
			return null;
		}

		return Math.floor(nextTrackDurationSeconds * 1000);
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

	private toTrackLoaderUrl(
		fileUrl: string,
		nextFileUrl: string | null,
		trackId: string | null,
		nextTrackId: string | null,
		trackDurationMs: number | null,
		nextTrackDurationMs: number | null,
	): string {
		const encoded = encodeURIComponent(fileUrl);
		const encodedTrackId = trackId ? encodeURIComponent(trackId) : '';
		const durationQuery =
			trackDurationMs != null && Number.isFinite(trackDurationMs) && trackDurationMs > 0
				? `&d=${Math.floor(trackDurationMs)}`
				: '';
		if (!nextFileUrl) {
			if (encodedTrackId) {
				return `atolla-track://audio?u=${encoded}&t=${encodedTrackId}${durationQuery}`;
			}
			return `atolla-track://audio?u=${encoded}${durationQuery}`;
		}

		const encodedNext = encodeURIComponent(nextFileUrl);
		const encodedNextTrackId = nextTrackId ? encodeURIComponent(nextTrackId) : '';
		const trackQuery = encodedTrackId ? `&t=${encodedTrackId}` : '';
		const nextTrackQuery = encodedNextTrackId ? `&nt=${encodedNextTrackId}` : '';
		const nextDurationQuery =
			nextTrackDurationMs != null && Number.isFinite(nextTrackDurationMs) && nextTrackDurationMs > 0
				? `&nd=${Math.floor(nextTrackDurationMs)}`
				: '';
		return `atolla-track://audio?u=${encoded}&n=${encodedNext}${trackQuery}${nextTrackQuery}${durationQuery}${nextDurationQuery}`;
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
