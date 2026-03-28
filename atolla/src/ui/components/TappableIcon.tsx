// @ts-nocheck
import { Component } from 'valdi_core/src/Component';
import { ElementRef } from 'valdi_core/src/ElementRef';
import { Style } from 'valdi_core/src/Style';
import type { ImageView } from 'valdi_tsx/src/NativeTemplateElements';
import { theme } from '../../theme';
import { animateRipple, createRippleStyle } from '../animations/Icons';

export interface TappableIconViewModel {
	accessibilityLabel?: string;
	animationsEnabled: boolean;
	disabledTint?: string;
	enabled?: boolean;
	hitSize?: number;
	icon: unknown;
	iconSize?: number;
	onTap?: () => void;
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

		this.viewModel.onTap?.();
		if (this.viewModel.animationsEnabled) {
			animateRipple(this, this.rippleRef, this.viewModel.hitSize ?? 40);
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
			contentDescription={accessibilityLabel}
			onTap={isEnabled ? this.handleTap : undefined}
			style={getButtonStyle(hitSize)}
		>
			<view ref={this.rippleRef} style={rippleStyle} />
			<image src={this.viewModel.icon} style={getIconStyle(iconSize)} tint={resolvedTint} />
		</view>;
	}
}

function getButtonStyle(hitSize: number): Style {
	return new Style({
		alignItems: 'center',
		height: hitSize,
		justifyContent: 'center',
		overflow: 'visible',
		position: 'relative',
		width: hitSize,
	});
}

function getIconStyle(iconSize: number): Style<ImageView> {
	return new Style({
		height: iconSize,
		width: iconSize,
	});
}
