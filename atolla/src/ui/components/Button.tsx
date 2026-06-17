import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { Label, View } from 'valdi_tsx/src/NativeTemplateElements';
import { theme } from '../../theme';
import { hapticFeedback } from '../haptics';

export const ButtonType = {
	Confirm: 'confirm',
	Error: 'error',
	Primary: 'primary',
	Secondary: 'secondary',
	Warn: 'warn',
} as const;

export type ButtonType = (typeof ButtonType)[keyof typeof ButtonType];

export interface ButtonViewModel {
	accessibilityId: string;
	animationsEnabled?: boolean;
	enabled?: boolean;
	label: string;
	onTap: () => void;
	style?: ButtonType;
}

export class Button extends Component<ButtonViewModel> {
	private handleTap = (): void => {
		if (this.viewModel.enabled === false) {
			return;
		}

		hapticFeedback();

		this.viewModel.onTap();
	};

	private containerStyle(): Style<View> {
		if (this.viewModel.enabled === false) {
			return styles.buttonDisabled;
		}
		if (this.viewModel.style === ButtonType.Secondary) {
			return styles.buttonSecondary;
		}
		if (this.viewModel.style === ButtonType.Confirm) {
			return styles.buttonConfirm;
		}

		return styles.button;
	}

	private labelStyle(): Style<Label> {
		switch (this.viewModel.style) {
			case ButtonType.Secondary:
				return styles.labelSecondary;
			case ButtonType.Error:
				return styles.labelError;
			case ButtonType.Warn:
				return styles.labelWarn;
			case ButtonType.Confirm:
				return styles.labelConfirm;
			default:
				return styles.label;
		}
	}

	onRender(): void {
		<view
			accessibilityId={`${this.viewModel.accessibilityId}-btn`}
			accessibilityLabel={`${this.viewModel.accessibilityId}-btn`}
			onTap={this.viewModel.enabled !== false ? this.handleTap : undefined}
			style={this.containerStyle()}
		>
			<label style={this.labelStyle()} value={this.viewModel.label} />
		</view>;
	}
}

const baseButton = new Style<View>({
	alignItems: 'center',
	backgroundColor: theme.colors.bgAccent,
	borderRadius: theme.radius.pill,
	marginBottom: 5,
	marginTop: 5,
	padding: 8,
	width: '100%',
});

const styles = {
	button: baseButton,
	buttonConfirm: baseButton.extend({ backgroundColor: theme.colors.active }),
	buttonDisabled: baseButton.extend({ backgroundColor: theme.colors.bgDim }),
	buttonSecondary: baseButton.extend({ backgroundColor: theme.colors.bgRaised }),
	label: new Style<Label>({
		...theme.text.main,
		color: theme.colors.active,
	}),
	labelConfirm: new Style<Label>({
		...theme.text.main,
		color: theme.colors.bg,
	}),
	labelError: new Style<Label>({
		...theme.text.main,
		color: theme.colors.destructive,
	}),
	labelSecondary: new Style<Label>({
		...theme.text.main,
		color: theme.colors.white,
	}),
	labelWarn: new Style<Label>({
		...theme.text.main,
		color: theme.colors.warning,
	}),
};
