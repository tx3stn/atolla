import { Style } from 'valdi_core/src/Style';
import type { AnimatedImage, View } from 'valdi_tsx/src/NativeTemplateElements';

const animationStyleCache = new Map<number, Style<AnimatedImage>>();
const rootStyleCache = new Map<number, Style<View>>();

export function getAnimationStyle(size: number): Style<AnimatedImage> {
	const existingStyle = animationStyleCache.get(size);
	if (existingStyle) {
		return existingStyle;
	}

	const createdStyle = new Style<AnimatedImage>({
		height: size,
		width: size,
	});
	animationStyleCache.set(size, createdStyle);
	return createdStyle;
}

export function getRootStyle(size: number): Style<View> {
	const existingStyle = rootStyleCache.get(size);
	if (existingStyle) {
		return existingStyle;
	}

	const createdStyle = new Style<View>({
		alignItems: 'center',
		height: size,
		justifyContent: 'center',
		width: size,
	});
	rootStyleCache.set(size, createdStyle);
	return createdStyle;
}
