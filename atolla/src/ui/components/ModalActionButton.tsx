import { Component } from 'valdi_core/src/Component';
import { ElementRef } from 'valdi_core/src/ElementRef';
import { Style } from 'valdi_core/src/Style';
import type { Label, View } from 'valdi_tsx/src/NativeTemplateElements';
import { theme } from '../../theme';
import { animateRowRipple, rowRippleStyle } from '../animations/Row';
import { hapticFeedback } from '../haptics';

export interface ModalActionButtonViewModel {
	accessibilityId?: string;
	animationsEnabled?: boolean;
	enabled?: boolean;
	label: string;
	labelStyle?: Style<Label>;
	onPress: () => void;
}

export class ModalActionButton extends Component<ModalActionButtonViewModel> {
	private buttonWidth = 140;
	private buttonHeight = 48;
	private rippleRef = new ElementRef();

	private handleLayout = (frame: { height: number; width: number }): void => {
		if (frame?.width > 0) {
			this.buttonWidth = frame.width;
		}
		if (frame?.height > 0) {
			this.buttonHeight = frame.height;
		}
	};

	private handleTap = (): void => {
		const { animationsEnabled, onPress } = this.viewModel;

		hapticFeedback();

		if (!animationsEnabled) {
			onPress();
			return;
		}

		animateRowRipple(this, this.rippleRef, this.buttonWidth, this.buttonHeight)
			.then(() => onPress())
			.catch(() => onPress());
	};

	onRender(): void {
		const { accessibilityId, enabled, label, labelStyle } = this.viewModel;
		const isEnabled = enabled !== false;

		<view
			accessibilityId={accessibilityId}
			accessibilityLabel={accessibilityId}
			onLayout={this.handleLayout}
			onTap={isEnabled ? this.handleTap : undefined}
			style={isEnabled ? styles.button : styles.buttonDisabled}
		>
			<view ref={this.rippleRef} style={rowRippleStyle} />
			<label style={labelStyle ?? styles.label} value={label} />
		</view>;
	}
}

const styles = {
	button: new Style<View>({
		alignItems: 'center',
		padding: 14,
		width: '50%',
	}),
	buttonDisabled: new Style<View>({
		alignItems: 'center',
		opacity: 0.4,
		padding: 14,
		width: '50%',
	}),
	label: new Style<Label>({
		...theme.text.main,
		textAlign: 'center',
	}),
};
