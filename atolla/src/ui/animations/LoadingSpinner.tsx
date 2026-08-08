import { makeAssetFromBytes } from 'valdi_core/src/Asset';
import { Component } from 'valdi_core/src/Component';
import type { ElementRef } from 'valdi_core/src/ElementRef';
import type { ValdiRuntime } from 'valdi_core/src/ValdiRuntime';
import type { Asset } from 'valdi_tsx/src/Asset';
import type { AnimatedImage } from 'valdi_tsx/src/NativeTemplateElements';
import { theme } from '../../theme';
import { getAnimationStyle, getRootStyle } from './Styles';

declare const runtime: ValdiRuntime;

const animationPath = 'src/ui/animations/spinner.json';
const defaultSize = 24;
const defaultSpeed = 1;

let animationAsset: Asset | undefined;

function getAnimationAsset(): Asset {
	if (!animationAsset) {
		const bytes = runtime.getModuleEntry('atolla', animationPath, false) as Uint8Array;
		animationAsset = makeAssetFromBytes(bytes);
	}
	return animationAsset;
}

export interface LoadingSpinnerViewModel {
	accessibilityId?: string;
	animationRef?: ElementRef<AnimatedImage>;
	size?: number;
	speed?: number;
	spinning?: boolean;
}

export class LoadingSpinner extends Component<LoadingSpinnerViewModel> {
	onRender(): void {
		const accessibilityId = this.viewModel.accessibilityId ?? 'spinner';
		const size = theme.scale(this.viewModel.size ?? defaultSize);
		const speed = this.viewModel.speed ?? defaultSpeed;
		const spinning = this.viewModel.spinning ?? true;

		<view
			accessibilityId={accessibilityId}
			accessibilityLabel={accessibilityId}
			style={getRootStyle(size)}
		>
			<animatedimage
				advanceRate={spinning ? speed : 0}
				loop={true}
				objectFit='contain'
				ref={this.viewModel.animationRef}
				src={getAnimationAsset()}
				style={getAnimationStyle(size)}
			/>
		</view>;
	}
}
