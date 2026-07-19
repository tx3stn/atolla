import { Component } from 'valdi_core/src/Component';
import { ElementRef } from 'valdi_core/src/ElementRef';
import { Style } from 'valdi_core/src/Style';
import type { Asset } from 'valdi_tsx/src/Asset';
import type { ImageView, Label, View } from 'valdi_tsx/src/NativeTemplateElements';
import { theme } from '../../theme';
import { animateRowRipple, rowRippleStyle } from '../animations/Row';

export interface ContextMenuActionRowViewModel {
	accessibilityId: string;
	animationsEnabled: boolean;
	icon: string | Asset;
	label: string;
	onPress: () => void;
}

export class ContextMenuActionRow extends Component<ContextMenuActionRowViewModel> {
	private rowHeight = 48;
	private rowWidth = 280;
	private rippleRef = new ElementRef();

	private handleLayout = (frame: { height: number; width: number }): void => {
		if (frame?.width > 0) {
			this.rowWidth = frame.width;
		}
		if (frame?.height > 0) {
			this.rowHeight = frame.height;
		}
	};

	private handleTap = (): void => {
		const { animationsEnabled, onPress } = this.viewModel;
		if (!animationsEnabled) {
			onPress();
			return;
		}

		animateRowRipple(this, this.rippleRef, this.rowWidth, this.rowHeight)
			.then(() => onPress())
			.catch(() => onPress());
	};

	onRender(): void {
		const { accessibilityId, icon, label } = this.viewModel;

		<view
			accessibilityId={accessibilityId}
			accessibilityLabel={accessibilityId}
			onLayout={this.handleLayout}
			onTap={this.handleTap}
			style={styles.actionRow}
		>
			<view ref={this.rippleRef} style={rowRippleStyle} />
			<image src={icon} style={styles.icon} tint={theme.colors.muted} />
			<label style={styles.actionLabel} value={label} />
		</view>;
	}
}

const styles = {
	actionLabel: new Style<Label>({
		...theme.text.subLarger,
	}),
	actionRow: new Style<View>({
		...theme.text.subLarger,
		flexDirection: 'row' as const,
		padding: 4,
		position: 'relative' as const,
		width: '100%',
	}),
	icon: new Style<ImageView>({
		height: 18,
		margin: 10,
		width: 18,
	}),
};
