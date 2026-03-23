// @ts-nocheck
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import { createReusableCallback } from 'valdi_core/src/utils/Callback';

export interface PlaybackProgressBarViewModel {
	accentColor: string;
	accessibilityLabel?: string;
	onProgressTap?: () => void;
	progressRatio: number;
	thickness?: number;
	trackColor: string;
}

export class PlaybackProgressBar extends Component<PlaybackProgressBarViewModel> {
	onRender(): void {
		const progressRatio = clamp(this.viewModel.progressRatio, 0, 1);
		const trackStyle = createTrackStyle(this.viewModel.thickness ?? 4);
		const railStyle = createRailStyle(this.viewModel.trackColor, this.viewModel.thickness ?? 4);
		const fillStyle = createFillStyle(this.viewModel.accentColor, progressRatio);
		const playheadStyle = createPlayheadStyle(
			this.viewModel.accentColor,
			this.viewModel.thickness ?? 4,
		);

		<view
			accessibilityLabel={this.viewModel.accessibilityLabel}
			contentDescription={this.viewModel.accessibilityLabel}
			style={styles.root}
			testID='playback-progress-bar'
		>
			<view
				onTap={
					this.viewModel.onProgressTap
						? createReusableCallback(() => this.viewModel.onProgressTap?.())
						: undefined
				}
				style={trackStyle}
				testID='playback-progress-track'
			>
				<view style={railStyle} testID='playback-progress-rail'>
					<view style={fillStyle} testID='playback-progress-fill'>
						{progressRatio > 0 && (
							<view style={playheadStyle} testID='playback-progress-playhead' />
						)}
					</view>
				</view>
			</view>
		</view>;
	}
}

function createTrackStyle(thickness: number): Style {
	const clampedThickness = Math.max(2, thickness);
	const hitHeight = Math.max(24, clampedThickness + 10);
	return new Style({
		height: hitHeight,
		justifyContent: 'center',
		position: 'relative',
		width: '100%',
	});
}

function createRailStyle(trackColor: string, thickness: number): Style {
	const clampedThickness = Math.max(2, thickness);
	return new Style({
		backgroundColor: trackColor,
		borderRadius: clampedThickness / 2,
		height: clampedThickness,
		overflow: 'visible',
		width: '100%',
	});
}

function createFillStyle(accentColor: string, progressRatio: number): Style {
	return new Style({
		alignItems: 'flex-end',
		backgroundColor: accentColor,
		borderRadius: 999,
		display: 'flex',
		height: '100%',
		justifyContent: 'center',
		width: `${Math.round(progressRatio * 100)}%`,
	});
}

function createPlayheadStyle(accentColor: string, thickness: number): Style {
	const size = Math.max(10, thickness + 6);
	return new Style({
		backgroundColor: accentColor,
		borderColor: '#ffffff',
		borderRadius: size / 2,
		borderWidth: 1,
		height: size,
		marginRight: -size / 2,
		shadowColor: '#000000',
		shadowOffset: { height: 1, width: 0 },
		shadowOpacity: 0.25,
		shadowRadius: 2,
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
