import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { Label, View } from 'valdi_tsx/src/NativeTemplateElements';
import { theme } from '../../theme';

export interface ButtonViewModel {
	accessibilityLabel: string;
	enabled?: boolean;
	label: string;
	onTap: () => void;
}

export class Button extends Component<ButtonViewModel> {
	onRender(): void {
		<view
			accessibilityLabel={`${this.viewModel.accessibilityLabel}-btn`}
			onTap={this.viewModel.enabled !== false ? this.viewModel.onTap : undefined}
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
		borderRadius: 999,
		marginBottom: 5,
		marginTop: 5,
		padding: 10,
		width: '100%',
	}),
	buttonDisabled: new Style<View>({
		alignItems: 'center',
		backgroundColor: theme.colors.bgDim,
		borderRadius: 999,
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
