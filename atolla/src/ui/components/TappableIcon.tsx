import { Component } from 'valdi_core/src/Component';
import {
	DeviceHapticFeedbackType,
	performHapticFeedback as nativeBridgeHaptic,
} from 'valdi_core/src/DeviceBridge';
import { ElementRef } from 'valdi_core/src/ElementRef';
import { Style } from 'valdi_core/src/Style';
import type { Asset } from 'valdi_tsx/src/Asset';
import type { ImageView, View } from 'valdi_tsx/src/NativeTemplateElements';
import { theme } from '../../theme';
import { animateRipple, createRippleStyle } from '../animations/Icons';

export interface TappableIconViewModel {
	accessibilityLabel?: string;
	animationsEnabled: boolean;
	disabledTint?: string;
	enabled?: boolean;
	hitSize?: number;
	icon: string | Asset;
	iconSize?: number;
	onTap?: () => void;
	rippleScale?: number;
	rippleTint?: string;
	tint?: string;
}

export class TappableIcon extends Component<TappableIconViewModel> {
	private rippleRef = new ElementRef();

	private handleTap = (): void => {
		const isEnabled = this.viewModel.enabled !== false && !!this.viewModel.onTap;
		if (!isEnabled) {
			return;
		}

		try {
			nativeBridgeHaptic(DeviceHapticFeedbackType?.SELECTION ?? 'selection');
		} catch {}

		this.viewModel.onTap?.();
		if (this.viewModel.animationsEnabled) {
			animateRipple(
				this,
				this.rippleRef,
				this.viewModel.hitSize ?? 40,
				this.viewModel.rippleScale ?? 1.55,
			);
		}
	};

	onRender() {
		const {
			accessibilityLabel,
			disabledTint = theme.colors.muted,
			hitSize = 40,
			iconSize = 24,
			onTap,
			rippleTint,
			tint = theme.colors.white,
		} = this.viewModel;

		const isEnabled = this.viewModel.enabled !== false && !!onTap;
		const resolvedTint = isEnabled ? tint : disabledTint;
		const rippleStyle = createRippleStyle(rippleTint ?? resolvedTint, hitSize);

		<view
			accessibilityLabel={accessibilityLabel}
			onTap={isEnabled ? this.handleTap : undefined}
			style={getButtonStyle(hitSize)}
		>
			<view ref={this.rippleRef} style={rippleStyle} />
			<image src={this.viewModel.icon} style={getIconStyle(iconSize)} tint={resolvedTint} />
		</view>;
	}
}

const buttonStyleCache = new Map<number, Style<View>>();
const iconStyleCache = new Map<number, Style<ImageView>>();

function getButtonStyle(hitSize: number): Style<View> {
	const existingStyle = buttonStyleCache.get(hitSize);
	if (existingStyle) {
		return existingStyle;
	}

	const createdStyle = new Style<View>({
		alignItems: 'center',
		height: hitSize,
		justifyContent: 'center',
		overflow: 'visible',
		position: 'relative',
		width: hitSize,
	});
	buttonStyleCache.set(hitSize, createdStyle);
	return createdStyle;
}

function getIconStyle(iconSize: number): Style<ImageView> {
	const existingStyle = iconStyleCache.get(iconSize);
	if (existingStyle) {
		return existingStyle;
	}

	const createdStyle = new Style<ImageView>({
		height: iconSize,
		width: iconSize,
	});
	iconStyleCache.set(iconSize, createdStyle);
	return createdStyle;
}
