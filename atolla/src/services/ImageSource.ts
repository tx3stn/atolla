import type { ImageCategory } from './ImageCache';

export const atollaCacheScheme = 'atolla-cache';
export const atollaCacheHost = 'image';

export interface AtollaCacheSource {
	category: ImageCategory;
	url: string;
}

export function buildImageSource(url: string, category: ImageCategory): string {
	return `${atollaCacheScheme}://${atollaCacheHost}?c=${encodeURIComponent(category)}&u=${encodeURIComponent(url)}`;
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
		if (!category || !url) {
			return null;
		}

		if (!isImageCategory(category)) {
			return null;
		}

		return {
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
