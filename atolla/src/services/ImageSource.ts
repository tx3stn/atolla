import type { ImageCategory } from './ImageCache';

export const atollaCacheScheme = 'atolla-cache';
export const atollaCacheHost = 'image';

export interface AtollaCacheSource {
	authToken?: string;
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
	const effectiveUrl = normalizeImageUrlForCategory(url, category);
	const { strippedUrl, authToken } = extractAndStripApiKey(effectiveUrl);
	const cacheOnlyParam = options?.cacheOnly ? '&co=1' : '';
	const tokenParam = authToken ? `&tok=${encodeURIComponent(authToken)}` : '';
	return `${atollaCacheScheme}://${atollaCacheHost}?c=${encodeURIComponent(category)}&u=${encodeURIComponent(strippedUrl)}${cacheOnlyParam}${tokenParam}`;
}

function extractAndStripApiKey(url: string): { strippedUrl: string; authToken: string | null } {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return { authToken: null, strippedUrl: url };
	}
	const authToken = parsed.searchParams.get('api_key');
	if (!authToken) {
		return { authToken: null, strippedUrl: url };
	}
	parsed.searchParams.delete('api_key');
	return { authToken, strippedUrl: parsed.toString() };
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
		const authToken = parsed.searchParams.get('tok') ?? undefined;
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
			authToken,
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

function rewriteUrlForCategory(url: string, category: ImageCategory): string {
	const imageSizing = thumbSizingForCategory(category);
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

function thumbSizingForCategory(
	category: ImageCategory,
): { maxHeight: number; maxWidth: number; quality: number } | null {
	if (category === 'album_art_thumb' || category === 'playlist_image_thumb') {
		return { maxHeight: 384, maxWidth: 384, quality: 85 };
	}
	if (category === 'artist_image_thumb') {
		return { maxHeight: 512, maxWidth: 512, quality: 85 };
	}

	return null;
}
