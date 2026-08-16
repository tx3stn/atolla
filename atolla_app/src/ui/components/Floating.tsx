import { Component } from 'valdi_core/src/Component';
import { Device } from 'valdi_core/src/Device';
import { Style } from 'valdi_core/src/Style';
import type { View } from 'valdi_tsx/src/NativeTemplateElements';

// Floats its children above navigation push transitions.
//
// iOS: a pushed page fills the screen and composites ABOVE sibling views, so AtollaFloatingView
// hoists the children up to the window — the page transitions behind them.
//
// Android: a pushed page does not cover siblings. Sibling z-order already floats the children over
// the navigation, and each child is a small bar that only captures touches in its own area, so no
// native host is needed — the children render in place as a bare pass-through.
export class Floating extends Component {
	onRender(): void {
		if (Device.isAndroid()) {
			<slot />;
			return;
		}

		<custom-view iosClass='AtollaFloatingView' style={styles.host}>
			<slot />
		</custom-view>;
	}
}

const styles = {
	host: new Style<View>({
		bottom: 0,
		left: 0,
		position: 'absolute',
		right: 0,
		top: 0,
	}),
};
