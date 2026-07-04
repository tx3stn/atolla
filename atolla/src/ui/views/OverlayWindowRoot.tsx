import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { View } from 'valdi_tsx/src/NativeTemplateElements';
import { OverlayHost } from './OverlayHost';

// iOS-only adapter: the standalone Valdi root that AtollaOverlayHost mounts onto the main window. A
// plain <view> root is required — Valdi disallows a <custom-view> root in dev builds, and OverlayHost
// renders Floating (a custom-view on iOS). OverlayHost's Floating reparents the bars into a
// window-level pass-through layer, so this container holds nothing interactive; the native host
// disables interaction on it so empty regions fall through to the app below.
export class OverlayWindowRoot extends Component {
	onRender(): void {
		<view style={styles.root}>
			<OverlayHost />
		</view>;
	}
}

const styles = {
	root: new Style<View>({
		bottom: 0,
		left: 0,
		position: 'absolute',
		right: 0,
		top: 0,
	}),
};
