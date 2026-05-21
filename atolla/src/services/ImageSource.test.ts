import { describe, expect, it } from 'bun:test';
import {
	atollaCacheHost,
	atollaCacheScheme,
	buildImageSource,
	buildSafeImageSource,
	imageCacheKey,
	normalizeImageUrlForCategory,
	parseImageSource,
} from './ImageSource';

describe('ImageSource', () => {
	it('builds atolla-cache URI from url and category', () => {
		const source = buildImageSource('https://example.com/a b.jpg', 'album_art');
		expect(source).toBe(
			`${atollaCacheScheme}://${atollaCacheHost}?c=album_art&u=https%3A%2F%2Fexample.com%2Fa%20b.jpg`,
		);
	});

	it('adds Jellyfin thumbnail params for thumb categories', () => {
		const source = buildImageSource(
			'https://media.example.com/Items/123/Images/Primary?api_key=abc&tag=xyz',
			'album_art_thumb',
		);
		const parsed = parseImageSource(source);

		expect(parsed?.category).toBe('album_art_thumb');
		expect(parsed?.authToken).toBe('abc');
		expect(parsed?.url).toBe(
			'https://media.example.com/Items/123/Images/Primary?tag=xyz&maxWidth=384&maxHeight=384&quality=85',
		);
	});

	it('preserves explicit sizing params when already present', () => {
		const source = buildImageSource(
			'https://media.example.com/Items/123/Images/Primary?api_key=abc&maxWidth=256&maxHeight=256',
			'album_art_thumb',
		);

		const parsed = parseImageSource(source);
		expect(parsed?.authToken).toBe('abc');
		expect(parsed?.url).toBe(
			'https://media.example.com/Items/123/Images/Primary?maxWidth=256&maxHeight=256&quality=85',
		);
	});

	it('normalizes thumbnail URL consistently for preload and render', () => {
		const url = 'https://media.example.com/Items/123/Images/Primary?api_key=abc&tag=xyz';
		expect(normalizeImageUrlForCategory(url, 'album_art_thumb')).toBe(
			'https://media.example.com/Items/123/Images/Primary?api_key=abc&tag=xyz&maxWidth=384&maxHeight=384&quality=85',
		);
	});

	it('parses atolla-cache URI back to category and url', () => {
		const source = buildImageSource('https://example.com/image.jpg', 'artist_image');
		const parsed = parseImageSource(source);
		expect(parsed).toEqual({
			authToken: undefined,
			cacheOnly: false,
			category: 'artist_image',
			url: 'https://example.com/image.jpg',
		});
	});

	it('builds cache-only source when requested', () => {
		const source = buildImageSource('https://example.com/image.jpg', 'album_art', {
			cacheOnly: true,
		});
		expect(source).toContain('&co=1');
		expect(parseImageSource(source)).toEqual({
			authToken: undefined,
			cacheOnly: true,
			category: 'album_art',
			url: 'https://example.com/image.jpg',
		});
	});

	it('returns null for non-atolla-cache URI', () => {
		expect(parseImageSource('https://example.com/image.jpg')).toBeNull();
	});

	it('builds stable cache keys', () => {
		expect(imageCacheKey('https://example.com/image.jpg', 'playlist_image')).toBe(
			'playlist_image:https://example.com/image.jpg',
		);
	});
});

describe('buildSafeImageSource', () => {
	it('returns a source string for a valid url', () => {
		const result = buildSafeImageSource('https://example.com/image.jpg', 'album_art');
		expect(result).toBe(buildImageSource('https://example.com/image.jpg', 'album_art'));
	});

	it('returns null for null url', () => {
		expect(buildSafeImageSource(null, 'album_art')).toBeNull();
	});

	it('returns null for undefined url', () => {
		expect(buildSafeImageSource(undefined, 'album_art')).toBeNull();
	});

	it('returns null for empty string url', () => {
		expect(buildSafeImageSource('', 'album_art')).toBeNull();
	});
});
