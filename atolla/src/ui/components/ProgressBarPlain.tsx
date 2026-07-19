import { Component } from 'valdi_core/src/Component';
import { ElementRef } from 'valdi_core/src/ElementRef';
import { Style } from 'valdi_core/src/Style';
import { createReusableCallback } from 'valdi_core/src/utils/Callback';
import type { View } from 'valdi_tsx/src/NativeTemplateElements';
import type { PlaybackStore } from '../../stores/Playback';
import { theme } from '../../theme';

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
	private progressInitialized = false;

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
		const trackStyle = createTrackStyle(this.viewModel.thickness ?? 4);
		const railStyle = createRailStyle(this.viewModel.trackColor, this.viewModel.thickness ?? 4);
		const fillStyle = createFillStyle(this.viewModel.accentColor);
		const playheadStyle = createPlayheadStyle(
			this.viewModel.accentColor,
			this.viewModel.thickness ?? 4,
		);

		<view
			accessibilityId='playback-progress-bar'
			accessibilityLabel='playback-progress-bar'
			style={styles.root}
		>
			<view
				accessibilityId='playback-progress-track'
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
					<view
						accessibilityId='playback-progress-fill'
						accessibilityLabel='playback-progress-fill'
						ref={this.fillRef}
						style={fillStyle}
					>
						<view
							accessibilityId='playback-progress-playhead'
							accessibilityLabel='playback-progress-playhead'
							ref={this.playheadRef}
							style={playheadStyle}
						/>
					</view>
				</view>
			</view>
		</view>;

		if (!this.progressInitialized) {
			this.progressInitialized = true;
			this.updateProgressRefs();
		}
	}
}

const trackStyleByThickness: Record<number, Style<View>> = {};

function createTrackStyle(thickness: number): Style<View> {
	const cached = trackStyleByThickness[thickness];
	if (cached) {
		return cached;
	}

	const clampedThickness = Math.max(2, thickness);
	const hitHeight = Math.max(24, clampedThickness + 10);
	const style = new Style<View>({
		height: hitHeight,
		justifyContent: 'center',
		position: 'relative',
		width: '100%',
	});
	trackStyleByThickness[thickness] = style;
	return style;
}

const railStyleByColorAndThickness: Record<string, Style<View>> = {};

function createRailStyle(trackColor: string, thickness: number): Style<View> {
	const key = `${trackColor}|${thickness}`;
	const cached = railStyleByColorAndThickness[key];
	if (cached) {
		return cached;
	}

	const clampedThickness = Math.max(2, thickness);
	const style = new Style<View>({
		backgroundColor: trackColor,
		borderRadius: clampedThickness / 2,
		height: clampedThickness,
		overflow: 'visible',
		width: '100%',
	});
	railStyleByColorAndThickness[key] = style;
	return style;
}

const fillStyleByAccentColor: Record<string, Style<View>> = {};

function createFillStyle(accentColor: string): Style<View> {
	const cached = fillStyleByAccentColor[accentColor];
	if (cached) {
		return cached;
	}

	// width is intentionally omitted: set via ref in updateProgressRefs()
	const style = new Style<View>({
		alignItems: 'flex-end',
		backgroundColor: accentColor,
		borderRadius: theme.radius.pill,
		display: 'flex',
		height: '100%',
		justifyContent: 'center',
	});
	fillStyleByAccentColor[accentColor] = style;
	return style;
}

const playheadStyleByColorAndThickness: Record<string, Style<View>> = {};

function createPlayheadStyle(accentColor: string, thickness: number): Style<View> {
	const key = `${accentColor}|${thickness}`;
	const cached = playheadStyleByColorAndThickness[key];
	if (cached) {
		return cached;
	}

	// opacity is intentionally omitted: set via ref in updateProgressRefs()
	const size = Math.max(10, thickness + 6);
	const style = new Style<View>({
		backgroundColor: accentColor,
		borderColor: theme.colors.pureWhite,
		borderRadius: size / 2,
		borderWidth: 1,
		boxShadow: theme.shadow.playhead,
		height: size,
		marginRight: -size / 2,
		width: size,
	});
	playheadStyleByColorAndThickness[key] = style;
	return style;
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

const styles = {
	root: new Style<View>({
		width: '100%',
	}),
};
