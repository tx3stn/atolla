// @ts-nocheck
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
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
			contentDescription={`${this.viewModel.accessibilityLabel}-btn`}
			onTap={this.viewModel.enabled !== false ? this.viewModel.onTap : undefined}
			style={this.viewModel.enabled !== false ? styles.button : styles.buttonDisabled}
		>
			<label style={styles.buttonLabel} value={this.viewModel.label} />
		</view>;
	}
}

const buttonBase = {
	alignItems: 'center',
	borderRadius: 999,
	marginBottom: 5,
	marginTop: 5,
	padding: 10,
	width: '100%',
};

const styles = {
	button: new Style({
		...buttonBase,
		backgroundColor: theme.colors.bgAccent,
	}),
	buttonDisabled: new Style({
		...buttonBase,
		backgroundColor: theme.colors.bgDim,
	}),
	buttonLabel: new Style({
		...theme.text.main,
		color: theme.colors.active,
	}),
};
