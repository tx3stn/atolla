import res from 'atolla/res';
import { AnimationCurve } from 'valdi_core/src/AnimationOptions';
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { ImageView, Label, View } from 'valdi_tsx/src/NativeTemplateElements';
import { type ToastType, ToastTypes } from '../../services/ToastService';
import { theme } from '../../theme';
import { LoopingArrowSpinner } from './LoopingArrowSpinner';

const restTop = theme.padding.scrollHeader(null);
const hiddenTop = restTop - 12;
const iconSize = 18;

const enterAnimation = { damping: 22, stiffness: 260 };
const exitAnimation = { curve: AnimationCurve.EaseIn, duration: 0.18 };

export interface ToastViewModel {
	animationsEnabled: boolean;
	closing: boolean;
	message: string;
	// invoked once the exit animation completes (or immediately when animations are disabled) so the
	// host can clear the slot
	onDismissed: () => void;
	onTap?: () => void;
	variant: ToastType;
}

interface ToastState {
	shown: boolean;
}

interface VariantIcon {
	src: typeof res.checkmark;
	tint: string;
}

function variantIcon(variant: ToastType): VariantIcon | null {
	if (variant === ToastTypes.success) {
		return { src: res.checkmark, tint: theme.colors.success };
	}
	if (variant === ToastTypes.error) {
		return { src: res.alert, tint: theme.colors.destructive };
	}
	return null;
}

// the single themed toast pill: a translucent bar below the header (matching the library filter
// panel) that springs in and out. the progress variant shows a spinner; success/error show a tinted
// icon. auto-dismiss timing lives in ToastService, never here.
export class Toast extends StatefulComponent<ToastViewModel, ToastState> {
	state: ToastState = { shown: false };

	onCreate(): void {
		this.animateIn();
	}

	onRender(): void {
		const atRest = this.state.shown || !this.viewModel.animationsEnabled;
		const isProgress = this.viewModel.variant === ToastTypes.progress;
		const icon = variantIcon(this.viewModel.variant);

		<view
			accessibilityId='toast'
			accessibilityLabel='toast'
			onTap={this.viewModel.onTap}
			style={atRest ? styles.containerShown : styles.containerHidden}
		>
			{isProgress && (
				<view style={styles.leading}>
					<LoopingArrowSpinner
						accessibilityId='toast-spinner'
						size={iconSize}
						tint={theme.colors.white}
					/>
				</view>
			)}
			{!isProgress && icon && <image src={icon.src} style={styles.icon} tint={icon.tint} />}
			<label numberOfLines={2} style={styles.message} value={this.viewModel.message} />
		</view>;
	}

	onViewModelUpdate(previousViewModel?: ToastViewModel): void {
		const wasClosing = previousViewModel?.closing ?? false;
		if (this.viewModel.closing && !wasClosing) {
			this.animateOut();
		} else if (!this.viewModel.closing && wasClosing) {
			this.animateIn();
		}
	}

	private animateIn(): void {
		if (!this.viewModel.animationsEnabled) {
			return;
		}

		void Promise.resolve().then(() => {
			if (this.isDestroyed()) {
				return;
			}
			this.setStateAnimated({ shown: true }, enterAnimation);
		});
	}

	private animateOut(): void {
		if (!this.viewModel.animationsEnabled) {
			this.viewModel.onDismissed();
			return;
		}

		void Promise.resolve().then(() => {
			if (this.isDestroyed()) {
				return;
			}
			void this.setStateAnimatedPromise({ shown: false }, exitAnimation).then(() => {
				if (!this.isDestroyed()) {
					this.viewModel.onDismissed();
				}
			});
		});
	}
}

const containerBase = {
	alignItems: 'center' as const,
	backgroundColor: theme.colors.bgFrosted,
	borderRadius: theme.radius.default,
	boxShadow: theme.shadow.raised,
	flexDirection: 'row' as const,
	left: 16,
	paddingBottom: 12,
	paddingLeft: 16,
	paddingRight: 16,
	paddingTop: 12,
	position: 'absolute' as const,
	right: 16,
	zIndex: 200,
};

const styles = {
	containerHidden: new Style<View>({
		...containerBase,
		opacity: 0,
		top: hiddenTop,
	}),
	containerShown: new Style<View>({
		...containerBase,
		opacity: 1,
		top: restTop,
	}),
	icon: new Style<ImageView>({
		height: iconSize,
		marginRight: 10,
		width: iconSize,
	}),
	leading: new Style<View>({
		marginRight: 10,
	}),
	message: new Style<Label>({
		...theme.text.mainBold,
		flexShrink: 1,
	}),
};
