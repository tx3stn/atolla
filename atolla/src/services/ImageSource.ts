import type { ImageCategory } from './ImageCache';

export const atollaCacheScheme = 'atolla-cache';
export const atollaCacheHost = 'image';

export interface AtollaCacheSource {
	cacheOnly?: boolean;
	category: ImageCategory;
	url: string;
}

interface BuildImageSourceOptions {
	cacheOnly?: boolean;
}

export function buildImageSource(
	url: string,
	category: ImageCategory,
	options?: BuildImageSourceOptions,
): string {
	const cacheOnlyParam = options?.cacheOnly ? '&co=1' : '';
	return `${atollaCacheScheme}://${atollaCacheHost}?c=${encodeURIComponent(category)}&u=${encodeURIComponent(url)}${cacheOnlyParam}`;
}

export function parseImageSource(src: string): AtollaCacheSource | null {
	if (!src.startsWith(`${atollaCacheScheme}://`)) {
		return null;
	}

	try {
		const parsed = new URL(src);
		if (parsed.protocol !== `${atollaCacheScheme}:` || parsed.hostname !== atollaCacheHost) {
			return null;
		}

		const category = parsed.searchParams.get('c');
		const url = parsed.searchParams.get('u');
		const cacheOnly = parsed.searchParams.get('co') === '1';
		if (!category || !url) {
			return null;
		}

		if (!isImageCategory(category)) {
			return null;
		}

		return {
			cacheOnly,
			category,
			url,
		};
	} catch {
		return null;
	}
}

export function imageCacheKey(url: string, category: ImageCategory): string {
	return `${category}:${url}`;
}

function isImageCategory(value: string): value is ImageCategory {
	return (
		value === 'album_art' ||
		value === 'artist_image' ||
		value === 'artist_logo' ||
		value === 'playlist_image'
	);
}
