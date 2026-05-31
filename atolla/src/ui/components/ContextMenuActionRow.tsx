import { AnimationCurve } from 'valdi_core/src/AnimationOptions';
import { Component } from 'valdi_core/src/Component';
import { ElementRef } from 'valdi_core/src/ElementRef';
import { Style } from 'valdi_core/src/Style';
import type { Asset } from 'valdi_tsx/src/Asset';
import type { ImageView, Label } from 'valdi_tsx/src/NativeTemplateElements';
import { theme } from '../../theme';

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

		this.animateRowPress()
			.then(() => onPress())
			.catch(() => onPress());
	};

	private animateRowPress(): Promise<void> {
		const ref = this.rippleRef;
		const safeWidth = Math.max(1, this.rowWidth);
		const safeHeight = Math.max(1, this.rowHeight);
		const centerX = safeWidth / 2;
		const centerY = safeHeight / 2;
		const impactWidth = safeWidth * 0.2;
		const impactHeight = safeHeight * 0.45;

		ref.setAttribute('left', centerX);
		ref.setAttribute('top', centerY);
		ref.setAttribute('width', 0);
		ref.setAttribute('height', 0);
		ref.setAttribute('borderRadius', Math.max(2, safeHeight * 0.16));
		ref.setAttribute('opacity', 0);

		return this.animatePromise({ curve: AnimationCurve.EaseOut, duration: 0.04 }, () => {
			ref.setAttribute('left', centerX - impactWidth / 2);
			ref.setAttribute('top', centerY - impactHeight / 2);
			ref.setAttribute('width', impactWidth);
			ref.setAttribute('height', impactHeight);
			ref.setAttribute('borderRadius', Math.max(2, impactHeight * 0.25));
			ref.setAttribute('opacity', 0.26);
		}).then(() =>
			this.animatePromise({ curve: AnimationCurve.EaseOut, duration: 0.14 }, () => {
				ref.setAttribute('left', 0);
				ref.setAttribute('top', 0);
				ref.setAttribute('width', safeWidth);
				ref.setAttribute('height', safeHeight);
				ref.setAttribute('borderRadius', 0);
				ref.setAttribute('opacity', 0);
			}),
		);
	}

	onRender(): void {
		const { accessibilityId, icon, label } = this.viewModel;

		<view
			accessibilityId={accessibilityId}
			accessibilityLabel={accessibilityId}
			onLayout={this.handleLayout}
			onTap={this.handleTap}
			style={styles.actionRow}
		>
			<view ref={this.rippleRef} style={styles.actionRowRipple} />
			<image src={icon} style={styles.icon} tint={theme.colors.muted} />
			<label style={styles.actionLabel} value={label} />
		</view>;
	}
}

const styles = {
	actionLabel: new Style<Label>({
		...theme.text.subLarger,
	}),
	actionRow: new Style({
		...theme.text.subLarger,
		flexDirection: 'row' as const,
		padding: 4,
		position: 'relative' as const,
		width: '100%',
	}),
	actionRowRipple: new Style({
		backgroundColor: theme.colors.white,
		height: 0,
		left: 0,
		opacity: 0,
		position: 'absolute' as const,
		top: 0,
		width: 0,
		zIndex: 2,
	}),
	icon: new Style<ImageView>({
		height: 18,
		margin: 10,
		width: 18,
	}),
};
