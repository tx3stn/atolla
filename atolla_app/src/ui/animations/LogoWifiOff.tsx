import { makeAssetFromBytes } from 'valdi_core/src/Asset';
import { Component } from 'valdi_core/src/Component';
import type { ValdiRuntime } from 'valdi_core/src/ValdiRuntime';
import type { Asset } from 'valdi_tsx/src/Asset';
import { theme } from '../../theme';
import { getAnimationStyle, getRootStyle } from './Styles';

declare const runtime: ValdiRuntime;

const animationPath = 'src/ui/animations/logoWifiOff.json';
const defaultSize = 34;

let animationAsset: Asset | undefined;

function getAnimationAsset(): Asset {
	if (!animationAsset) {
		const bytes = runtime.getModuleEntry('atolla_app', animationPath, false) as Uint8Array;
		animationAsset = makeAssetFromBytes(bytes);
	}
	return animationAsset;
}

export interface LogoWifiOffViewModel {
	accessibilityId?: string;
	size?: number;
}

export class LogoWifiOff extends Component<LogoWifiOffViewModel> {
	onRender(): void {
		const accessibilityId = this.viewModel.accessibilityId ?? 'logo-wifi-off';
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
				src={getAnimationAsset()}
				style={getAnimationStyle(size)}
			/>
		</view>;
	}
}
