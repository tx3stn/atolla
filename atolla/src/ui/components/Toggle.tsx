import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import { createReusableCallback } from 'valdi_core/src/utils/Callback';
import type { View } from 'valdi_tsx/src/NativeTemplateElements';
import { theme } from '../../theme';

const TRACK_WIDTH = 44;
const TRACK_HEIGHT = 26;
const THUMB_SIZE = 20;
const THUMB_MARGIN = 3;

export interface ToggleViewModel {
	accessibilityId?: string;
	enabled: boolean;
	onToggle: (enabled: boolean) => void;
}

export class Toggle extends Component<ToggleViewModel> {
	onRender(): void {
		const { accessibilityId, enabled, onToggle } = this.viewModel;
		const thumbOffset = enabled ? TRACK_WIDTH - THUMB_SIZE - THUMB_MARGIN : THUMB_MARGIN;

		<view
			accessibilityId={accessibilityId}
			accessibilityLabel={accessibilityId}
			onTap={createReusableCallback(() => onToggle(!enabled))}
			style={enabled ? styles.trackOn : styles.trackOff}
		>
			<view style={createThumbStyle(thumbOffset)} />
		</view>;
	}
}

function createThumbStyle(marginLeft: number): Style<View> {
	return new Style<View>({
		backgroundColor: theme.colors.white,
		borderRadius: THUMB_SIZE / 2,
		height: THUMB_SIZE,
		marginLeft,
		width: THUMB_SIZE,
	});
}

const styles = {
	trackOff: new Style<View>({
		backgroundColor: theme.colors.bgAccent,
		borderRadius: TRACK_HEIGHT / 2,
		height: TRACK_HEIGHT,
		justifyContent: 'center',
		width: TRACK_WIDTH,
	}),
	trackOn: new Style<View>({
		backgroundColor: theme.colors.active,
		borderRadius: TRACK_HEIGHT / 2,
		height: TRACK_HEIGHT,
		justifyContent: 'center',
		width: TRACK_WIDTH,
	}),
};
