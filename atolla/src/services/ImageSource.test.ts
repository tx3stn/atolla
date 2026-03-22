import { describe, expect, it } from 'bun:test';
import {
	atollaCacheHost,
	atollaCacheScheme,
	buildImageSource,
	imageCacheKey,
	parseImageSource,
} from './ImageSource';

describe('ImageSource', () => {
	it('builds atolla-cache URI from url and category', () => {
		const source = buildImageSource('https://example.com/a b.jpg', 'album_art');
		expect(source).toBe(
			`${atollaCacheScheme}://${atollaCacheHost}?c=album_art&u=https%3A%2F%2Fexample.com%2Fa%20b.jpg`,
		);
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
