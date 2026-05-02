import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import { createReusableCallback } from 'valdi_core/src/utils/Callback';
import type { ImageView, View } from 'valdi_tsx/src/NativeTemplateElements';
import { ProgressBarPlain } from './ProgressBarPlain';

export interface ProgressBarWaveformViewModel {
	accentColor: string;
	accessibilityLabel?: string;
	maskImageUrl: string | null | undefined;
	mutedColor: string;
	onProgressTap?: (ratio?: number) => void;
	progressRatio: number;
	thickness?: number;
	trackColor: string;
}

const WAVEFORM_HEIGHT = 50;

export class ProgressBarWaveform extends Component<ProgressBarWaveformViewModel> {
	private trackWidth: number | null = null;

	private handleTrackLayout = (frame: { width: number }) => {
		this.trackWidth = frame.width;
	};

	onRender(): void {
		const {
			accentColor,
			accessibilityLabel,
			maskImageUrl,
			mutedColor,
			onProgressTap,
			progressRatio,
			thickness,
			trackColor,
		} = this.viewModel;

		if (!maskImageUrl) {
			<ProgressBarPlain
				accentColor={accentColor}
				accessibilityLabel={accessibilityLabel}
				onProgressTap={onProgressTap}
				progressRatio={progressRatio}
				thickness={thickness}
				trackColor={trackColor}
			/>;
			return;
		}

		const clampedRatio = Math.max(0, Math.min(1, progressRatio));
		const progressPercent = Math.round(clampedRatio * 100);
		const mutedImageStyle = createMutedImageStyle(mutedColor);
		const accentImageStyle = createAccentImageStyle(accentColor, progressPercent);

		<view
			accessibilityLabel={accessibilityLabel ?? 'waveform-progress-bar'}
			onLayout={this.handleTrackLayout}
			onTap={
				onProgressTap
					? createReusableCallback((event) => {
							const ratio =
								this.trackWidth != null && event?.x != null
									? Math.max(0, Math.min(1, event.x / this.trackWidth))
									: undefined;
							onProgressTap(ratio);
						})
					: undefined
			}
			style={styles.container}
		>
			<image
				accessibilityLabel='waveform-progress-unplayed'
				objectFit='fill'
				src={maskImageUrl}
				style={mutedImageStyle}
			/>
			{clampedRatio > 0 && (
				<view accessibilityLabel='waveform-progress-clip' style={createClipStyle(progressPercent)}>
					<image
						accessibilityLabel='waveform-progress-played'
						objectFit='fill'
						src={maskImageUrl}
						style={accentImageStyle}
					/>
				</view>
			)}
		</view>;
	}
}

function createMutedImageStyle(mutedColor: string): Style<ImageView> {
	return new Style<ImageView>({
		bottom: 0,
		left: 0,
		position: 'absolute',
		right: 0,
		tint: mutedColor,
		top: 0,
	});
}

function createClipStyle(progressPercent: number): Style<View> {
	return new Style<View>({
		bottom: 0,
		left: 0,
		position: 'absolute',
		slowClipping: true,
		top: 0,
		width: `${progressPercent}%`,
	});
}

function createAccentImageStyle(accentColor: string, progressPercent: number): Style<ImageView> {
	// The clip container is progressPercent% wide. To render the image at full bar
	// width (so the waveform shape isn't squished), scale the image to
	// (100/progressPercent * 100)% of the clip container, which equals 100% of the
	// full bar. slowClipping on the parent clips the overflow.
	const stretchPercent = progressPercent > 0 ? Math.round(10000 / progressPercent) : 100;
	return new Style<ImageView>({
		bottom: 0,
		left: 0,
		position: 'absolute',
		tint: accentColor,
		top: 0,
		width: `${stretchPercent}%`,
	});
}

const styles = {
	container: new Style<View>({
		height: WAVEFORM_HEIGHT,
		position: 'relative',
		width: '100%',
	}),
};
