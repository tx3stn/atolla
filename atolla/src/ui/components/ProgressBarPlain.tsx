import { Component } from 'valdi_core/src/Component';
import { ElementRef } from 'valdi_core/src/ElementRef';
import { Style } from 'valdi_core/src/Style';
import { createReusableCallback } from 'valdi_core/src/utils/Callback';
import type { View } from 'valdi_tsx/src/NativeTemplateElements';
import type { PlaybackStore } from '../../stores/Playback';

export interface ProgressBarPlainViewModel {
	accentColor: string;
	onProgressTap?: (ratio?: number) => void;
	playbackStore: PlaybackStore;
	thickness?: number;
	trackColor: string;
	trackDuration: number;
}

export class ProgressBarPlain extends Component<ProgressBarPlainViewModel> {
	private trackWidth: number | null = null;
	private unsubscribeProgress?: () => void;
	private fillRef = new ElementRef();
	private playheadRef = new ElementRef();

	private handleTrackLayout = (frame: { width: number }) => {
		this.trackWidth = frame.width;
	};

	onViewModelUpdate(prevViewModel: ProgressBarPlainViewModel): void {
		if (!prevViewModel) {
			this.unsubscribeProgress = this.viewModel.playbackStore?.subscribe(() => {
				this.updateProgressRefs();
			});
		}
	}

	onDestroy(): void {
		this.unsubscribeProgress?.();
	}

	private updateProgressRefs(): void {
		const { playbackStore, trackDuration } = this.viewModel;
		if (!playbackStore) return;
		const ratio = clamp(
			trackDuration > 0 ? playbackStore.progressSeconds / trackDuration : 0,
			0,
			1,
		);
		const pct = Math.round(ratio * 100);
		this.fillRef.setAttribute('width', `${pct}%`);
		this.playheadRef.setAttribute('opacity', ratio > 0 ? 1 : 0);
	}

	onRender(): void {
		const { playbackStore, trackDuration } = this.viewModel;
		const progressRatio = clamp(
			trackDuration > 0 ? playbackStore.progressSeconds / trackDuration : 0,
			0,
			1,
		);
		const trackStyle = createTrackStyle(this.viewModel.thickness ?? 4);
		const railStyle = createRailStyle(this.viewModel.trackColor, this.viewModel.thickness ?? 4);
		const fillStyle = createFillStyle(this.viewModel.accentColor, progressRatio);
		const playheadStyle = createPlayheadStyle(
			this.viewModel.accentColor,
			this.viewModel.thickness ?? 4,
			progressRatio > 0 ? 1 : 0,
		);

		<view accessibilityLabel='playback-progress-bar' style={styles.root}>
			<view
				accessibilityLabel='playback-progress-track'
				onLayout={this.handleTrackLayout}
				onTap={
					this.viewModel.onProgressTap
						? createReusableCallback((event) => {
								const ratio =
									this.trackWidth != null && event?.x != null
										? clamp(event.x / this.trackWidth, 0, 1)
										: undefined;
								this.viewModel.onProgressTap?.(ratio);
							})
						: undefined
				}
				style={trackStyle}
			>
				<view style={railStyle}>
					<view accessibilityLabel='playback-progress-fill' ref={this.fillRef} style={fillStyle}>
						<view
							accessibilityLabel='playback-progress-playhead'
							ref={this.playheadRef}
							style={playheadStyle}
						/>
					</view>
				</view>
			</view>
		</view>;
	}
}

function createTrackStyle(thickness: number): Style<View> {
	const clampedThickness = Math.max(2, thickness);
	const hitHeight = Math.max(24, clampedThickness + 10);
	return new Style<View>({
		height: hitHeight,
		justifyContent: 'center',
		position: 'relative',
		width: '100%',
	});
}

function createRailStyle(trackColor: string, thickness: number): Style<View> {
	const clampedThickness = Math.max(2, thickness);
	return new Style<View>({
		backgroundColor: trackColor,
		borderRadius: clampedThickness / 2,
		height: clampedThickness,
		overflow: 'visible',
		width: '100%',
	});
}

function createFillStyle(accentColor: string, progressRatio: number): Style<View> {
	return new Style<View>({
		alignItems: 'flex-end',
		backgroundColor: accentColor,
		borderRadius: 999,
		display: 'flex',
		height: '100%',
		justifyContent: 'center',
		width: `${Math.round(progressRatio * 100)}%`,
	});
}

function createPlayheadStyle(accentColor: string, thickness: number, opacity: number): Style<View> {
	const size = Math.max(10, thickness + 6);
	return new Style<View>({
		backgroundColor: accentColor,
		borderColor: '#ffffff',
		borderRadius: size / 2,
		borderWidth: 1,
		boxShadow: '0 1 2 rgba(0,0,0,0.25)',
		height: size,
		marginRight: -size / 2,
		opacity,
		width: size,
	});
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

const styles = {
	root: new Style({
		width: '100%',
	}),
};
