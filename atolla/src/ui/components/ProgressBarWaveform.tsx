import { Component } from 'valdi_core/src/Component';
import { ElementRef } from 'valdi_core/src/ElementRef';
import { Style } from 'valdi_core/src/Style';
import { createReusableCallback } from 'valdi_core/src/utils/Callback';
import type { ImageView, View } from 'valdi_tsx/src/NativeTemplateElements';
import type { PlaybackStore } from '../../stores/Playback';
import { ProgressBarPlain } from './ProgressBarPlain';

export interface ProgressBarWaveformViewModel {
	accentColor: string;
	accessibilityLabel?: string;
	maskImageUrl: string | null | undefined;
	mutedColor: string;
	onProgressTap?: (ratio?: number) => void;
	playbackStore: PlaybackStore;
	thickness?: number;
	trackColor: string;
	trackDuration: number;
}

const WAVEFORM_HEIGHT = 35;

export class ProgressBarWaveform extends Component<ProgressBarWaveformViewModel> {
	private trackWidth: number | null = null;
	private unsubscribeProgress?: () => void;
	private clipRef = new ElementRef();
	private accentRef = new ElementRef();

	private handleTrackLayout = (frame: { width: number }) => {
		this.trackWidth = frame.width;
	};

	onViewModelUpdate(prevViewModel: ProgressBarWaveformViewModel): void {
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
		const clampedRatio = Math.max(
			0,
			Math.min(1, trackDuration > 0 ? playbackStore.progressSeconds / trackDuration : 0),
		);
		const progressPercent = Math.round(clampedRatio * 100);
		const stretchPercent = progressPercent > 0 ? Math.round(10000 / progressPercent) : 100;
		this.clipRef.setAttribute('width', `${progressPercent}%`);
		this.accentRef.setAttribute('width', `${stretchPercent}%`);
	}

	onRender(): void {
		const {
			accentColor,
			accessibilityLabel,
			maskImageUrl,
			mutedColor,
			onProgressTap,
			playbackStore,
			thickness,
			trackColor,
			trackDuration,
		} = this.viewModel;

		if (!maskImageUrl) {
			<ProgressBarPlain
				accentColor={accentColor}
				onProgressTap={onProgressTap}
				playbackStore={playbackStore}
				thickness={thickness}
				trackColor={trackColor}
				trackDuration={trackDuration}
			/>;
			return;
		}

		const mutedImageStyle = createMutedImageStyle(mutedColor);
		const accentImageStyle = createAccentImageStyle(accentColor);

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
			style={styles.tapZone}
		>
			<view style={styles.container}>
				<image
					accessibilityLabel='waveform-progress-unplayed'
					objectFit='fill'
					src={maskImageUrl}
					style={mutedImageStyle}
				/>
				<view accessibilityLabel='waveform-progress-clip' ref={this.clipRef} style={styles.clip}>
					<image
						accessibilityLabel='waveform-progress-played'
						objectFit='fill'
						ref={this.accentRef}
						src={maskImageUrl}
						style={accentImageStyle}
					/>
				</view>
			</view>
		</view>;
		this.updateProgressRefs();
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

function createAccentImageStyle(accentColor: string): Style<ImageView> {
	// Width is intentionally omitted — set via ref in updateProgressRefs() to avoid
	// Style applications from re-renders overriding more recent setAttribute calls.
	return new Style<ImageView>({
		bottom: 0,
		left: 0,
		position: 'absolute',
		tint: accentColor,
		top: 0,
	});
}

const TAP_ZONE_HEIGHT = 48;

const styles = {
	clip: new Style<View>({
		bottom: 0,
		left: 0,
		position: 'absolute',
		slowClipping: true,
		top: 0,
	}),
	container: new Style<View>({
		height: WAVEFORM_HEIGHT,
		position: 'relative',
		width: '100%',
	}),
	tapZone: new Style<View>({
		height: TAP_ZONE_HEIGHT,
		justifyContent: 'center',
		width: '100%',
	}),
};
