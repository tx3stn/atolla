import type { ImageCategory } from './ImageCache';

export const atollaCacheScheme = 'atolla-cache';
export const atollaCacheHost = 'image';

// `id` addresses the cache entry and is the only thing the native loader keys on. `url` is the
// fetch source for a miss. It is absent when the caller only has an id (an artist logo reached
// from an album), and buildImageSource drops it while offline so a miss can't fetch. `tag` comes
// from the url and is only read when writing, so a caller with just an id still resolves cached
// bytes.
export interface ImageSourceRef {
	category: ImageCategory;
	id: string;
	url?: string | null;
}

let imageSourcesOffline = false;

export function configureImageSourcesOffline(offline: boolean): void {
	imageSourcesOffline = offline;
}

export function buildImageSource({ category, id, url }: ImageSourceRef): string {
	const params = [`c=${encodeURIComponent(category)}`, `id=${encodeURIComponent(id)}`];

	if (url && !imageSourcesOffline) {
		const normalized = stripApiKeyFromUrl(normalizeImageUrlForCategory(url, category));
		const tag = extractImageTag(normalized);
		if (tag) {
			params.push(`t=${encodeURIComponent(tag)}`);
		}
		params.push(`u=${encodeURIComponent(normalized)}`);
	}

	return `${atollaCacheScheme}://${atollaCacheHost}?${params.join('&')}`;
}

export function extractImageTag(url: string): string | null {
	try {
		return new URL(url).searchParams.get('tag');
	} catch {
		return null;
	}
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

export function imageCacheKey(id: string, category: ImageCategory): string {
	return `${category}:${id}`;
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

export function configureAlbumArtMaxDimension(maxDimension: number): void {
	for (const category of ['album_art', 'album_art_blurred'] as const) {
		const sizing = categorySizing[category];
		if (sizing) {
			sizing.maxHeight = maxDimension;
			sizing.maxWidth = maxDimension;
		}
	}
}

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
