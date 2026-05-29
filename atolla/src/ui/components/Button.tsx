import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { Label, View } from 'valdi_tsx/src/NativeTemplateElements';
import { theme } from '../../theme';
import { hapticFeedback } from '../haptics';

export interface ButtonViewModel {
	accessibilityId: string;
	enabled?: boolean;
	label: string;
	onTap: () => void;
}

export class Button extends Component<ButtonViewModel> {
	private handleTap = (): void => {
		if (this.viewModel.enabled === false) {
			return;
		}

		hapticFeedback();

		this.viewModel.onTap();
	};

	onRender(): void {
		<view
			accessibilityId={`${this.viewModel.accessibilityId}-btn`}
			accessibilityLabel={`${this.viewModel.accessibilityId}-btn`}
			onTap={this.viewModel.enabled !== false ? this.handleTap : undefined}
			style={this.viewModel.enabled !== false ? styles.button : styles.buttonDisabled}
		>
			<label style={styles.buttonLabel} value={this.viewModel.label} />
		</view>;
	}
}

const styles = {
	button: new Style<View>({
		alignItems: 'center',
		backgroundColor: theme.colors.bgAccent,
		borderRadius: theme.radius.pill,
		marginBottom: 5,
		marginTop: 5,
		padding: 10,
		width: '100%',
	}),
	buttonDisabled: new Style<View>({
		alignItems: 'center',
		backgroundColor: theme.colors.bgDim,
		borderRadius: theme.radius.pill,
		marginBottom: 5,
		marginTop: 5,
		padding: 10,
		width: '100%',
	}),
	buttonLabel: new Style<Label>({
		...theme.text.main,
		color: theme.colors.active,
	}),
};
