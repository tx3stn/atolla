// @ts-nocheck
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { Label } from 'valdi_tsx/src/NativeTemplateElements';
import { theme } from '../../theme';

export interface SpinnerViewModel {
	accessibilityLabel?: string;
	label?: string;
}

interface SpinnerState {
	frameIndex: number;
}

const frames = ['|', '/', '-', '\\'];

export class Spinner extends StatefulComponent<SpinnerViewModel, SpinnerState> {
	private timer?: ReturnType<typeof setInterval>;

	state: SpinnerState = {
		frameIndex: 0,
	};

	onCreate(): void {
		this.timer = setInterval(() => {
			this.setState({
				frameIndex: (this.state.frameIndex + 1) % frames.length,
			});
		}, 120);
	}

	onDestroy(): void {
		if (this.timer) {
			clearInterval(this.timer);
		}
	}

	onRender(): void {
		<view
			accessibilityLabel={this.viewModel.accessibilityLabel ?? 'spinner'}
			contentDescription={this.viewModel.accessibilityLabel ?? 'spinner'}
			style={styles.root}
		>
			<label style={styles.glyph} value={frames[this.state.frameIndex]} />
			{this.viewModel.label && <label style={styles.label} value={this.viewModel.label} />}
		</view>;
	}
}

const styles = {
	glyph: new Style<Label>({
		...theme.text.mainBold,
		color: theme.colors.active,
	}),
	label: new Style<Label>({
		...theme.text.sub,
		marginLeft: 8,
	}),
	root: new Style({
		alignItems: 'center',
		flexDirection: 'row',
		paddingVertical: 8,
	}),
};
