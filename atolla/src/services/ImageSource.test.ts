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
		expect(source).not.toContain('tok=');
		expect(source).not.toContain('api_key');
		expect(parsed?.url).toBe(
			'https://media.example.com/Items/123/Images/Primary?tag=xyz&maxWidth=512&maxHeight=512&quality=85',
		);
	});

	it('preserves explicit sizing params when already present', () => {
		const source = buildImageSource(
			'https://media.example.com/Items/123/Images/Primary?api_key=abc&maxWidth=256&maxHeight=256',
			'album_art_thumb',
		);

		const parsed = parseImageSource(source);
		expect(source).not.toContain('tok=');
		expect(source).not.toContain('api_key');
		expect(parsed?.url).toBe(
			'https://media.example.com/Items/123/Images/Primary?maxWidth=256&maxHeight=256&quality=85',
		);
	});

	it('normalizes thumbnail URL consistently for preload and render', () => {
		const url = 'https://media.example.com/Items/123/Images/Primary?api_key=abc&tag=xyz';
		expect(normalizeImageUrlForCategory(url, 'album_art_thumb')).toBe(
			'https://media.example.com/Items/123/Images/Primary?api_key=abc&tag=xyz&maxWidth=512&maxHeight=512&quality=85',
		);
	});

	it('requests display-sized album art instead of the full-resolution original', () => {
		const url = 'https://media.example.com/Items/123/Images/Primary?tag=xyz';
		expect(normalizeImageUrlForCategory(url, 'album_art')).toBe(
			'https://media.example.com/Items/123/Images/Primary?tag=xyz&maxWidth=1280&maxHeight=1280&quality=90',
		);
	});

	it('sizes artist and playlist detail art to the header size', () => {
		const url = 'https://media.example.com/Items/123/Images/Primary?tag=xyz';
		expect(normalizeImageUrlForCategory(url, 'artist_image')).toBe(
			'https://media.example.com/Items/123/Images/Primary?tag=xyz&maxWidth=768&maxHeight=768&quality=85',
		);
		expect(normalizeImageUrlForCategory(url, 'playlist_image')).toBe(
			'https://media.example.com/Items/123/Images/Primary?tag=xyz&maxWidth=768&maxHeight=768&quality=85',
		);
	});

	it('sizes genre grid art down from the full-resolution original', () => {
		const url = 'https://media.example.com/Items/123/Images/Primary?tag=xyz';
		expect(normalizeImageUrlForCategory(url, 'genre_art')).toBe(
			'https://media.example.com/Items/123/Images/Primary?tag=xyz&maxWidth=512&maxHeight=512&quality=85',
		);
	});

	it('leaves transparent artist logos untouched so the alpha is preserved', () => {
		const url = 'https://media.example.com/Items/123/Images/Logo?tag=xyz';
		expect(normalizeImageUrlForCategory(url, 'artist_logo')).toBe(url);
	});

	it('requests the blurred backdrop at the same size as album art', () => {
		const url = 'https://media.example.com/Items/123/Images/Primary?tag=xyz';
		expect(normalizeImageUrlForCategory(url, 'album_art_blurred')).toBe(
			normalizeImageUrlForCategory(url, 'album_art'),
		);
	});

	it('leaves non-Jellyfin image urls unchanged for sized categories', () => {
		const url = 'https://cdn.example.com/cover.jpg';
		expect(normalizeImageUrlForCategory(url, 'album_art')).toBe(url);
	});

	it('parses atolla-cache URI back to category and url', () => {
		const source = buildImageSource('https://example.com/image.jpg', 'artist_image');
		const parsed = parseImageSource(source);
		expect(parsed).toEqual({
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
