// @ts-nocheck
import { Style } from 'valdi_core/src/Style';
import type { ImageView } from 'valdi_tsx/src/NativeTemplateElements';

export const iconButtonStyle = new Style({
	alignItems: 'center',
	height: 40,
	justifyContent: 'center',
	overflow: 'visible',
	position: 'relative',
	width: 40,
});

export const iconImageStyle = new Style<ImageView>({
	height: 24,
	width: 24,
});

export function createRippleStyle(tint: string): Style {
	return new Style({
		backgroundColor: tint,
		borderRadius: 0,
		height: 24,
		left: 20,
		opacity: 0,
		position: 'absolute',
		top: 20,
		width: 24,
	});
}

export function animateRipple(component: any, ref: any): void {
	const center = 20;
	const impactSize = 20;
	const impactOffset = center - impactSize / 2;
	const rippleSize = 62;
	const rippleOffset = center - rippleSize / 2;

	ref.setAttribute('left', center);
	ref.setAttribute('top', center);
	ref.setAttribute('width', 0);
	ref.setAttribute('height', 0);
	ref.setAttribute('borderRadius', 0);
	ref.setAttribute('opacity', 0.52);

	component
		.animatePromise({ curve: 'easeOut', duration: 0.07 }, () => {
			ref.setAttribute('left', impactOffset);
			ref.setAttribute('top', impactOffset);
			ref.setAttribute('width', impactSize);
			ref.setAttribute('height', impactSize);
			ref.setAttribute('borderRadius', impactSize / 2);
			ref.setAttribute('opacity', 0.34);
		})
		.then(() => {
			return component.animatePromise({ curve: 'easeOut', duration: 0.34 }, () => {
				ref.setAttribute('left', rippleOffset);
				ref.setAttribute('top', rippleOffset);
				ref.setAttribute('width', rippleSize);
				ref.setAttribute('height', rippleSize);
				ref.setAttribute('borderRadius', rippleSize / 2);
				ref.setAttribute('opacity', 0);
			});
		});
}
