import res from 'atolla/res';
import { AnimationCurve, type AnimationOptions } from 'valdi_core/src/AnimationOptions';
import { StatefulComponent } from 'valdi_core/src/Component';
import { ElementRef } from 'valdi_core/src/ElementRef';
import { Style } from 'valdi_core/src/Style';
import type { DragEvent } from 'valdi_tsx/src/GestureEvents';
import type { ImageView, Label, View } from 'valdi_tsx/src/NativeTemplateElements';
import { type ToastType, ToastTypes } from '../../services/ToastService';
import { theme } from '../../theme';
import { LoadingSpinner } from '../animations/LoadingSpinner';
import { TouchEventState } from './TouchEventState';

const restTop = theme.padding.scrollHeader(null);
const hiddenTop = restTop - 12;
const iconSize = 18;
// beyond this the message spills past the two-line clamp, so the toast becomes tappable to unclamp it.
// an approximation of two lines at the pill's width — exact truncation isn't measurable here.
const longMessageLength = 56;

const enterAnimation = { damping: 22, stiffness: 260 };
const exitAnimation = { curve: AnimationCurve.EaseIn, duration: 0.18 };

export interface ToastViewModel {
	animationsEnabled: boolean;
	closing: boolean;
	detail?: string;
	message: string;
	// invoked once the exit animation completes (or immediately when animations are disabled) so the
	// host can clear the slot
	onDismissed: () => void;
	onTap?: () => void;
	variant: ToastType;
}

interface ToastState {
	expanded: boolean;
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
	if (variant === ToastTypes.info) {
		return { src: res.info, tint: theme.colors.active };
	}
	return null;
}

// the single themed toast pill: a translucent bar below the header (matching the library filter
// panel) that springs in and out. the progress variant shows a spinner; success/error show a tinted
// icon. auto-dismiss timing lives in ToastService, never here.
const swipeBase = 16;
// past either threshold a horizontal swipe dismisses; below it the pill springs back to rest
const swipeDismissDistance = 100;
const swipeDismissVelocity = 600;
const swipeOffScreen = 500;

export class Toast extends StatefulComponent<ToastViewModel, ToastState> {
	state: ToastState = { expanded: false, shown: false };

	private containerRef = new ElementRef();

	onCreate(): void {
		this.animateIn();
	}

	onRender(): void {
		const atRest = this.state.shown || !this.viewModel.animationsEnabled;
		const isProgress = this.viewModel.variant === ToastTypes.progress;
		const icon = variantIcon(this.viewModel.variant);
		const expanded = this.state.expanded;

		<view
			accessibilityId='toast'
			accessibilityLabel='toast'
			onDrag={this.handleDrag}
			onTap={this.handleTap()}
			ref={this.containerRef}
			style={atRest ? styles.containerShown : styles.containerHidden}
		>
			{isProgress && (
				<view style={styles.leading}>
					<LoadingSpinner accessibilityId='toast-spinner' size={iconSize} />
				</view>
			)}
			{!isProgress && icon && <image src={icon.src} style={styles.icon} tint={icon.tint} />}
			<view style={styles.textColumn}>
				<label
					numberOfLines={expanded ? 0 : 2}
					style={styles.message}
					value={this.viewModel.message}
				/>
				{expanded && this.viewModel.detail && (
					<label numberOfLines={0} style={styles.detail} value={this.viewModel.detail} />
				)}
			</view>
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

	// a horizontal swipe in either direction dismisses the toast (matching the compact now-playing bar):
	// follow the finger, then either fling it off-screen and dismiss or spring it back to rest.
	private handleDrag = (event: DragEvent): void => {
		if (event.state === TouchEventState.Changed) {
			this.containerRef.setAttribute('left', swipeBase + event.deltaX);
			this.containerRef.setAttribute('right', swipeBase - event.deltaX);
			return;
		}

		if (event.state !== TouchEventState.Ended) {
			return;
		}

		const isHorizontal = Math.abs(event.deltaX) >= Math.abs(event.deltaY);
		const hasEnoughDistance = Math.abs(event.deltaX) >= swipeDismissDistance;
		const hasEnoughVelocity = Math.abs(event.velocityX) >= swipeDismissVelocity;

		if (isHorizontal && (hasEnoughDistance || hasEnoughVelocity)) {
			const offset = event.deltaX > 0 ? swipeOffScreen : -swipeOffScreen;
			void this.runAnimatePromise({ damping: 30, stiffness: 300 }, () => {
				this.containerRef.setAttribute('left', swipeBase + offset);
				this.containerRef.setAttribute('right', swipeBase - offset);
			}).then(() => {
				if (!this.isDestroyed()) {
					this.viewModel.onDismissed();
				}
			});
			return;
		}

		this.runAnimate({ damping: 18, stiffness: 280 }, () => {
			this.containerRef.setAttribute('left', swipeBase);
			this.containerRef.setAttribute('right', swipeBase);
		});
	};

	// an explicit onTap action wins; otherwise a toast with detail or an over-long message taps to
	// expand in place. plain short toasts stay non-interactive.
	private handleTap(): (() => void) | undefined {
		if (this.viewModel.onTap) {
			return this.viewModel.onTap;
		}
		if (this.isExpandable()) {
			return this.toggleExpanded;
		}
		return undefined;
	}

	private isExpandable(): boolean {
		return this.viewModel.detail !== undefined || this.viewModel.message.length > longMessageLength;
	}

	private runAnimate(options: AnimationOptions, callback: () => void): void {
		if (this.viewModel.animationsEnabled) {
			this.animate(options, callback);
		} else {
			callback();
		}
	}

	private runAnimatePromise(options: AnimationOptions, callback: () => void): Promise<void> {
		if (this.viewModel.animationsEnabled) {
			return this.animatePromise(options, callback);
		}
		callback();
		return Promise.resolve();
	}

	private toggleExpanded = (): void => {
		this.setState({ expanded: !this.state.expanded });
	};
}

const containerBase = {
	alignItems: 'flex-start' as const,
	backgroundColor: theme.colors.bgRaisedFrosted,
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
	detail: new Style<Label>({
		...theme.text.sub,
		marginTop: 4,
	}),
	icon: new Style<ImageView>({
		height: theme.scale(iconSize),
		marginRight: 10,
		marginTop: 2,
		width: theme.scale(iconSize),
	}),
	leading: new Style<View>({
		marginRight: 10,
		marginTop: 2,
	}),
	message: new Style<Label>({
		...theme.text.mainBold,
	}),
	textColumn: new Style<View>({
		flexDirection: 'column' as const,
		flexShrink: 1,
	}),
};
