import { Style } from 'valdi_core/src/Style';
import type { ImageView, View } from 'valdi_tsx/src/NativeTemplateElements';

interface RippleAnimator {
	animatePromise(options: object, callback: () => void): Promise<void>;
}

interface RippleElementRef {
	setAttribute(name: string, value: unknown): void;
}

export const iconImageStyle = new Style<ImageView>({
	height: 24,
	width: 24,
});

const rippleStyleByTintAndHitSize: Record<string, Style<View>> = {};

export function createRippleStyle(tint: string, hitSize = 40): Style<View> {
	const key = `${tint}|${hitSize}`;
	const cached = rippleStyleByTintAndHitSize[key];
	if (cached) {
		return cached;
	}

	const center = hitSize / 2;
	const style = new Style<View>({
		backgroundColor: tint,
		borderRadius: 0,
		height: 0,
		left: center,
		opacity: 0,
		position: 'absolute',
		top: center,
		width: 0,
	});
	rippleStyleByTintAndHitSize[key] = style;
	return style;
}

export function animateRipple(
	component: RippleAnimator,
	ref: RippleElementRef,
	hitSize = 40,
	rippleScale = 1.55,
): void {
	const center = hitSize / 2;
	const impactSize = hitSize * 0.5;
	const impactOffset = center - impactSize / 2;
	const rippleSize = hitSize * rippleScale;
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
