import { makeAssetFromBytes } from 'valdi_core/src/Asset';
import { Component } from 'valdi_core/src/Component';
import type { ValdiRuntime } from 'valdi_core/src/ValdiRuntime';
import type { Asset } from 'valdi_tsx/src/Asset';
import type { AnimatedImageOnProgressEvent } from 'valdi_tsx/src/NativeTemplateElements';
import { theme } from '../../theme';
import { getAnimationStyle, getRootStyle } from './Styles';

declare const runtime: ValdiRuntime;

const animationPath = 'src/ui/animations/logoWaveformReveal.json';
const defaultSize = 34;
const progressEpsilon = 0.02;

let animationAsset: Asset | undefined;

function getAnimationAsset(): Asset {
	if (!animationAsset) {
		const bytes = runtime.getModuleEntry('atolla', animationPath, false) as Uint8Array;
		animationAsset = makeAssetFromBytes(bytes);
	}
	return animationAsset;
}

export interface LogoWaveformRevealViewModel {
	accessibilityId?: string;
	onComplete: () => void;
	size?: number;
}

export class LogoWaveformReveal extends Component<LogoWaveformRevealViewModel> {
	private hasCompleted = false;

	onRender(): void {
		const accessibilityId = this.viewModel.accessibilityId ?? 'logo-waveform-reveal';
		const size = theme.scaleNav(this.viewModel.size ?? defaultSize);

		<view
			accessibilityId={accessibilityId}
			accessibilityLabel={accessibilityId}
			style={getRootStyle(size)}
		>
			<animatedimage
				advanceRate={1}
				loop={false}
				objectFit='contain'
				onProgress={this.handleProgress}
				src={getAnimationAsset()}
				style={getAnimationStyle(size)}
			/>
		</view>;
	}

	private handleProgress = (event: AnimatedImageOnProgressEvent): void => {
		if (this.hasCompleted || event.duration <= 0) {
			return;
		}

		if (event.time < event.duration - progressEpsilon) {
			return;
		}

		this.hasCompleted = true;
		this.viewModel.onComplete();
	};
}
