import { Style } from 'valdi_core/src/Style';
import { theme } from '../../theme';

interface RippleAnimator {
	animatePromise(options: object, callback: () => void): Promise<void>;
}

interface RippleElementRef {
	setAttribute(name: string, value: unknown): void;
}

export const rowRippleStyle = new Style({
	backgroundColor: theme.colors.white,
	height: 0,
	left: 0,
	opacity: 0,
	position: 'absolute' as const,
	top: 0,
	width: 0,
	zIndex: 2,
});

// two-phase press ripple for rectangular rows/buttons: a quick impact spot at the centre
// of the pressed surface that expands to fill it while fading out. returns the animation
// promise so callers can defer their press action until the ripple has played
export function animateRowRipple(
	component: RippleAnimator,
	ref: RippleElementRef,
	width: number,
	height: number,
): Promise<void> {
	const safeWidth = Math.max(1, width);
	const safeHeight = Math.max(1, height);
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

	return component
		.animatePromise({ curve: 'easeOut', duration: 0.04 }, () => {
			ref.setAttribute('left', centerX - impactWidth / 2);
			ref.setAttribute('top', centerY - impactHeight / 2);
			ref.setAttribute('width', impactWidth);
			ref.setAttribute('height', impactHeight);
			ref.setAttribute('borderRadius', Math.max(2, impactHeight * 0.25));
			ref.setAttribute('opacity', 0.26);
		})
		.then(() => {
			return component.animatePromise({ curve: 'easeOut', duration: 0.14 }, () => {
				ref.setAttribute('left', 0);
				ref.setAttribute('top', 0);
				ref.setAttribute('width', safeWidth);
				ref.setAttribute('height', safeHeight);
				ref.setAttribute('borderRadius', 0);
				ref.setAttribute('opacity', 0);
			});
		});
}
