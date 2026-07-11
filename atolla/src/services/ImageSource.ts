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

export function buildSafeImageSource(
	url: string | null | undefined,
	category: ImageCategory,
	options?: BuildImageSourceOptions,
): string | null {
	if (!url) return null;
	return buildImageSource(url, category, options);
}

export function buildImageSource(
	url: string,
	category: ImageCategory,
	options?: BuildImageSourceOptions,
): string {
	const strippedUrl = stripApiKeyFromUrl(normalizeImageUrlForCategory(url, category));
	const cacheOnlyParam = options?.cacheOnly ? '&co=1' : '';
	return `${atollaCacheScheme}://${atollaCacheHost}?c=${encodeURIComponent(category)}&u=${encodeURIComponent(strippedUrl)}${cacheOnlyParam}`;
}

// defensive: the token is delivered to native fetchers out-of-band as a header, never in the
// URL, but strip any stray api_key so a token can never reach a cache key or the src identity
export function stripApiKeyFromUrl(url: string): string {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return url;
	}
	if (!parsed.searchParams.has('api_key')) {
		return url;
	}
	parsed.searchParams.delete('api_key');
	return parsed.toString();
}

export function normalizeImageUrlForCategory(url: string, category: ImageCategory): string {
	return rewriteUrlForCategory(url, category);
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

		if (!url.startsWith('http://') && !url.startsWith('https://')) {
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
		value === 'album_art_thumb' ||
		value === 'album_art_blurred' ||
		value === 'artist_image' ||
		value === 'artist_image_thumb' ||
		value === 'artist_logo' ||
		value === 'genre_art' ||
		value === 'playlist_image' ||
		value === 'playlist_image_thumb'
	);
}

interface ImageSizing {
	maxHeight: number;
	maxWidth: number;
	quality: number;
}

const categorySizing: Record<ImageCategory, ImageSizing | null> = {
	album_art: { maxHeight: 1280, maxWidth: 1280, quality: 90 },
	album_art_blurred: { maxHeight: 1280, maxWidth: 1280, quality: 90 },
	album_art_thumb: { maxHeight: 512, maxWidth: 512, quality: 85 },
	artist_image: { maxHeight: 768, maxWidth: 768, quality: 85 },
	artist_image_thumb: { maxHeight: 512, maxWidth: 512, quality: 85 },
	artist_logo: null,
	genre_art: { maxHeight: 512, maxWidth: 512, quality: 85 },
	playlist_image: { maxHeight: 768, maxWidth: 768, quality: 85 },
	playlist_image_thumb: { maxHeight: 512, maxWidth: 512, quality: 85 },
};

function rewriteUrlForCategory(url: string, category: ImageCategory): string {
	const imageSizing = categorySizing[category];
	if (!imageSizing) {
		return url;
	}

	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return url;
	}

	if (!/^https?:$/i.test(parsed.protocol)) {
		return url;
	}

	if (!/\/Items\/[^/]+\/Images\//i.test(parsed.pathname)) {
		return url;
	}

	const params = parsed.searchParams;
	if (!params.has('maxWidth')) {
		params.set('maxWidth', String(imageSizing.maxWidth));
	}
	if (!params.has('maxHeight')) {
		params.set('maxHeight', String(imageSizing.maxHeight));
	}
	if (!params.has('quality')) {
		params.set('quality', String(imageSizing.quality));
	}

	return parsed.toString();
}
