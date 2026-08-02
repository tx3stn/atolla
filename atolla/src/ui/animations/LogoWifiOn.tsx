import { makeAssetFromBytes } from 'valdi_core/src/Asset';
import { Component } from 'valdi_core/src/Component';
import type { ValdiRuntime } from 'valdi_core/src/ValdiRuntime';
import type { Asset } from 'valdi_tsx/src/Asset';
import { getAnimationStyle, getRootStyle } from './Styles';

declare const runtime: ValdiRuntime;

const animationPath = 'src/ui/animations/logoWifiOn.json';
const defaultSize = 34;

let animationAsset: Asset | undefined;

function getAnimationAsset(): Asset {
	if (!animationAsset) {
		const bytes = runtime.getModuleEntry('atolla', animationPath, false) as Uint8Array;
		animationAsset = makeAssetFromBytes(bytes);
	}
	return animationAsset;
}

export interface LogoWifiOnViewModel {
	accessibilityId?: string;
	size?: number;
}

export class LogoWifiOn extends Component<LogoWifiOnViewModel> {
	onRender(): void {
		const accessibilityId = this.viewModel.accessibilityId ?? 'logo-wifi-on';
		const size = this.viewModel.size ?? defaultSize;

		<view
			accessibilityId={accessibilityId}
			accessibilityLabel={accessibilityId}
			style={getRootStyle(size)}
		>
			<animatedimage
				advanceRate={1}
				loop={false}
				objectFit='contain'
				src={getAnimationAsset()}
				style={getAnimationStyle(size)}
			/>
		</view>;
	}
}
